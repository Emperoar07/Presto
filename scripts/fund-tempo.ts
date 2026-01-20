import hre from "hardhat";

async function main() {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  console.log("Requesting funds for:", deployer.address);

  // Use the Tempo RPC directly
  const provider = new ethers.JsonRpcProvider("https://rpc.moderato.tempo.xyz");
  
  try {
    // Check balance before
    const balanceBefore = await provider.getBalance(deployer.address);
    console.log("Balance before:", ethers.formatEther(balanceBefore));

    console.log("Sending tempo_fundAddress request...");
    const result = await provider.send("tempo_fundAddress", [deployer.address]);
    console.log("Funding request result:", result);

    // Wait a bit for the transaction to be processed
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Check balance after
    const balanceAfter = await provider.getBalance(deployer.address);
    console.log("Balance after:", ethers.formatEther(balanceAfter));
    
  } catch (error) {
    console.error("Funding request failed:", error);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
