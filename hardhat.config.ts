import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config"

const LOCAL_RPC_URL = process.env.LOCAL_RPC_URL || "https://rpcurl"
const LOCAL_PRIVATE_KEY = process.env.LOCAL_PRIVATE_KEY || "0xprivkey"

const config: HardhatUserConfig = {
  solidity: "0.8.17",
  networks: {
    localhost: {
      url: LOCAL_RPC_URL,
      accounts: [
        LOCAL_PRIVATE_KEY,
      ],
      chainId: 31337,
    },
  }
};

export default config;
