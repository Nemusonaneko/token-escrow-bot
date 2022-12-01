require("dotenv").config();
const { gql, request } = require("graphql-request");
const { ethers } = require("ethers");
const abi = require("./abis/TokenEscrow.json");

const chainInfo = {
  5: {
    contractAddress: "0x02266E3b5cE26d62Ea73Ea7f2C542EBc24121c01",
    graphApi:
      "https://api.thegraph.com/subgraphs/name/nemusonaneko/token-escrow-goerli",
    rpcUrl: "https://rpc.ankr.com/eth_goerli",
  },
};

async function run(chainId, currentTime) {
  const provider = new ethers.providers.JsonRpcProvider(
    chainInfo[chainId].rpcUrl
  );
  const signer = new ethers.Wallet(process.env.PK, provider);
  const contract = new ethers.Contract(
    chainInfo[chainId].contractAddress,
    abi,
    provider
  );
  const interface = contract.interface;
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
  const calls = [];
  for (const i in escrows) {
    const escrow = escrows[i];
    calls.push(
      interface.encodeFunctionData("redeem", [
        escrow.token.address,
        escrow.payer,
        escrow.payee,
        escrow.amount,
        escrow.release,
      ])
    );
  }
  if (calls.length > 0) {
    await contract.connect(signer).batch(calls, false, {
      gasLimit: 1000000,
    });
  }
}

async function main() {
  const now = Math.floor(Date.now() / 1e3);
  Object.keys(chainInfo).forEach((chainId) => {
    run(chainId, now);
  });
}

main();
