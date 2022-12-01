import { SecretsManager } from "aws-sdk";
import { ethers } from "ethers";
import { request, gql } from "graphql-request";
import * as abi from "./abis/TokenEscrow.json";

const bot = "something";
const chainInfo: {
  [key: number]: {
    contractAddress: string;
    graphApi: string;
    rpcUrl: string;
  };
} = {
  5: {
    contractAddress: "0x02266E3b5cE26d62Ea73Ea7f2C542EBc24121c01",
    graphApi:
      "https://api.thegraph.com/subgraphs/name/nemusonaneko/token-escrow-goerli",
    rpcUrl: "https://rpc.ankr.com/eth_goerli",
  },
};

async function getSecret(): Promise<string> {
  const client = new SecretsManager({});
  const data = await client.getSecretValue({ SecretId: "privkey" }).promise();
  return JSON.parse(data.SecretString!).privkey;
}

async function run(chainId: number, currentTime: number) {
  const provider = new ethers.providers.JsonRpcProvider(
    chainInfo[chainId].rpcUrl
  );
  const pk = await getSecret();
  const signer = new ethers.Wallet(pk, provider);
  const contract = new ethers.Contract(
    chainInfo[chainId].contractAddress,
    abi,
    provider
  );
  const contractInterface = contract.interface;
  const query = gql`
        {
          escrows(where: { active: true, release_lte: ${currentTime} }) {
            token {
              address
            }
            payer
            payee
            amount
            release
          }
        }
      `;
  const escrows = (await request(chainInfo[chainId].graphApi, query)).escrows;
  const calls: string[] = [];
  for (const i in escrows) {
    const escrow = escrows[i];
    calls.push(
      contractInterface.encodeFunctionData("redeem", [
        escrow.token.address,
        escrow.payer,
        escrow.payee,
        escrow.amount,
        escrow.release,
      ])
    );
  }
  if (calls.length > 0) {
    const callData = contractInterface.encodeFunctionData("batch", [
      calls,
      false,
    ]);
    const callCost = await provider.estimateGas({
      from: bot,
      to: chainInfo[chainId].contractAddress,
      data: callData,
    });
    await contract.connect(signer).batch(calls, false, {
      gasLimit: Number(callCost) + 100000,
    });
  }
}

const handler = async () => {
  const now = Math.floor(Date.now() / 1e3);
  Object.keys(chainInfo).forEach((chainId) => {
    run(Number(chainId), now);
  });
};

export default handler;
