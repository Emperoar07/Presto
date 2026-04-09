import type { WalletClient, PublicClient, Abi, TransactionReceipt } from 'viem';

const DEPLOYMENTS_STORAGE_KEY = 'presto-deployments';

export type DeploymentType = 'token' | 'nft' | 'contract';

export type DeploymentRecord = {
  address: string;
  chainId: number;
  type: DeploymentType;
  name: string;
  symbol?: string;
  owner: string;
  hash: string;
  createdAt: number;
  metadata?: Record<string, string | number>;
};

export type DeployResult = {
  address: `0x${string}`;
  hash: `0x${string}`;
  receipt: TransactionReceipt;
};

export async function loadTokenArtifact(): Promise<{ abi: Abi; bytecode: `0x${string}` }> {
  const artifact = await import('./artifacts/DeployableToken.json');
  return { abi: artifact.abi as Abi, bytecode: artifact.bytecode as `0x${string}` };
}

export async function loadNFTArtifact(): Promise<{ abi: Abi; bytecode: `0x${string}` }> {
  const artifact = await import('./artifacts/DeployableNFT.json');
  return { abi: artifact.abi as Abi, bytecode: artifact.bytecode as `0x${string}` };
}

export async function deployContract(
  walletClient: WalletClient,
  publicClient: PublicClient,
  params: { abi: Abi; bytecode: `0x${string}`; args?: unknown[] },
): Promise<DeployResult> {
  const hash = await walletClient.deployContract({
    abi: params.abi,
    bytecode: params.bytecode,
    args: params.args ?? [],
    chain: walletClient.chain,
    account: walletClient.account!,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (!receipt.contractAddress) {
    throw new Error('Contract deployment failed — no address in receipt');
  }

  return { address: receipt.contractAddress, hash, receipt };
}

function safeLocalStorage() {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

export function saveDeployment(record: DeploymentRecord): void {
  const storage = safeLocalStorage();
  if (!storage) return;
  try {
    const existing = loadAllDeployments();
    existing.unshift(record);
    storage.setItem(DEPLOYMENTS_STORAGE_KEY, JSON.stringify(existing.slice(0, 100)));
  } catch {
    // Ignore storage errors
  }
}

export function loadAllDeployments(): DeploymentRecord[] {
  const storage = safeLocalStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(DEPLOYMENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function loadDeployments(owner: string): DeploymentRecord[] {
  return loadAllDeployments().filter(
    (d) => d.owner.toLowerCase() === owner.toLowerCase(),
  );
}
