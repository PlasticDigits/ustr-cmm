/**
 * Terra Classic wallet integration using cosmes
 * Supports: Station, Keplr, LUNC Dash, Galaxy Station, Leap, Cosmostation
 */
import {
  ConnectedWallet,
  CosmostationController,
  GalaxyStationController,
  KeplrController,
  LeapController,
  LUNCDashController,
  StationController,
  WalletController,
  WalletName,
  WalletType,
} from '@goblinhunt/cosmes/wallet';
import { MsgExecuteContract } from '@goblinhunt/cosmes/client';
import { CosmosTxV1beta1Fee as Fee } from '@goblinhunt/cosmes/protobufs';
import type { UnsignedTx } from '@goblinhunt/cosmes/wallet';
import { NETWORKS, DEFAULT_NETWORK } from '../utils/constants';

// Terra Classic gas configuration
// Terra Classic LCD doesn't support /cosmos/tx/v1beta1/simulate (returns 501),
// so we use fixed gas limits
const GAS_PRICE_ULUNA = '28.325'; // uluna per gas unit
const CW20_SEND_GAS_LIMIT = 350000; // Gas for CW20 Send with embedded message

const networkConfig = NETWORKS[DEFAULT_NETWORK];
const TERRA_CLASSIC_CHAIN_ID = networkConfig.chainId;
const TERRA_RPC_URL = networkConfig.rpc;

const WC_PROJECT_ID = '2ce7811b869be33ffad28cff05c93c15'; // Public WalletConnect project ID

// Gas price for Terra Classic (28.325 uluna per gas unit)
const GAS_PRICE = {
  amount: '28.325',
  denom: 'uluna',
};

// Create wallet controllers
const STATION_CONTROLLER = new StationController();
const KEPLR_CONTROLLER = new KeplrController(WC_PROJECT_ID);
const LUNCDASH_CONTROLLER = new LUNCDashController();
const GALAXY_CONTROLLER = new GalaxyStationController(WC_PROJECT_ID);
const LEAP_CONTROLLER = new LeapController(WC_PROJECT_ID);
const COSMOSTATION_CONTROLLER = new CosmostationController(WC_PROJECT_ID);

const CONTROLLERS: Partial<Record<WalletName, WalletController>> = {
  [WalletName.STATION]: STATION_CONTROLLER,
  [WalletName.KEPLR]: KEPLR_CONTROLLER,
  [WalletName.LUNCDASH]: LUNCDASH_CONTROLLER,
  [WalletName.GALAXYSTATION]: GALAXY_CONTROLLER,
  [WalletName.LEAP]: LEAP_CONTROLLER,
  [WalletName.COSMOSTATION]: COSMOSTATION_CONTROLLER,
};

// Store connected wallets
const connectedWallets: Map<string, ConnectedWallet> = new Map();

// Export wallet types for external use
export { WalletName, WalletType };
export type TerraWalletType = 'station' | 'keplr' | 'luncdash' | 'galaxy' | 'leap' | 'cosmostation';

/**
 * Get chain info for Terra Classic
 */
function getChainInfo() {
  return {
    chainId: TERRA_CLASSIC_CHAIN_ID,
    rpc: TERRA_RPC_URL,
    gasPrice: GAS_PRICE,
  };
}

/**
 * Check if Station wallet is installed
 */
export function isStationInstalled(): boolean {
  return typeof window !== 'undefined' && 'station' in window;
}

/**
 * Check if Keplr wallet is installed
 */
export function isKeplrInstalled(): boolean {
  return typeof window !== 'undefined' && !!window.keplr;
}

/**
 * Check if Leap wallet is installed
 */
export function isLeapInstalled(): boolean {
  return typeof window !== 'undefined' && !!window.leap;
}

/**
 * Check if Cosmostation wallet is installed
 */
export function isCosmostationInstalled(): boolean {
  return typeof window !== 'undefined' && !!window.cosmostation;
}

/**
 * Connect to Terra Classic wallet using cosmes
 */
export async function connectTerraWallet(
  walletName: WalletName = WalletName.STATION,
  walletType: WalletType = WalletType.EXTENSION
): Promise<{ address: string; walletType: TerraWalletType; connectionType: WalletType }> {
  const controller = CONTROLLERS[walletName];
  if (!controller) {
    throw new Error(`Unsupported wallet: ${walletName}`);
  }

  try {
    const chainInfo = getChainInfo();
    console.log(`[Wallet] Connecting ${walletName} (${walletType}) to chain ${chainInfo.chainId}`);
    
    const wallets = await controller.connect(walletType, [chainInfo]);
    
    if (wallets.size === 0) {
      // Handle WalletConnect edge cases
      if (walletType === WalletType.WALLETCONNECT) {
        throw new Error(
          'WalletConnect connection failed. The wallet may be connected but unable to verify. ' +
          'Please try disconnecting and reconnecting.'
        );
      }
      throw new Error('No wallets connected');
    }

    // Get the wallet for Terra Classic chain
    const wallet = wallets.get(TERRA_CLASSIC_CHAIN_ID);
    if (!wallet) {
      throw new Error(`Failed to connect to Terra Classic chain (${TERRA_CLASSIC_CHAIN_ID})`);
    }

    connectedWallets.set(TERRA_CLASSIC_CHAIN_ID, wallet);

    // Map wallet name to wallet type string
    const walletTypeMap: Partial<Record<WalletName, TerraWalletType>> = {
      [WalletName.STATION]: 'station',
      [WalletName.KEPLR]: 'keplr',
      [WalletName.LUNCDASH]: 'luncdash',
      [WalletName.GALAXYSTATION]: 'galaxy',
      [WalletName.LEAP]: 'leap',
      [WalletName.COSMOSTATION]: 'cosmostation',
    };

    return {
      address: wallet.address,
      walletType: walletTypeMap[walletName] || 'station',
      connectionType: walletType,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Provide specific error messages
    if (walletName === WalletName.KEPLR) {
      if (errorMessage.includes('not installed') || errorMessage.includes('Keplr')) {
        throw new Error('Keplr wallet is not installed. Please install the Keplr extension.');
      }
    }
    
    if (walletName === WalletName.STATION) {
      if (errorMessage.includes('not installed') || errorMessage.includes('Station')) {
        throw new Error('Station wallet is not installed. Please install the Station extension.');
      }
    }
    
    if (errorMessage.includes('User rejected') || errorMessage.includes('rejected')) {
      throw new Error('Connection rejected by user');
    }
    
    // Get wallet display name
    const displayNames: Partial<Record<WalletName, string>> = {
      [WalletName.STATION]: 'Station',
      [WalletName.KEPLR]: 'Keplr',
      [WalletName.LUNCDASH]: 'LUNC Dash',
      [WalletName.GALAXYSTATION]: 'Galaxy Station',
      [WalletName.LEAP]: 'Leap',
      [WalletName.COSMOSTATION]: 'Cosmostation',
    };
    
    throw new Error(`Failed to connect ${displayNames[walletName] || 'wallet'}: ${errorMessage}`);
  }
}

/**
 * Disconnect wallet
 */
export async function disconnectTerraWallet(): Promise<void> {
  const wallet = connectedWallets.get(TERRA_CLASSIC_CHAIN_ID);
  if (wallet) {
    const controller = CONTROLLERS[wallet.id];
    if (controller) {
      controller.disconnect([TERRA_CLASSIC_CHAIN_ID]);
    }
    connectedWallets.delete(TERRA_CLASSIC_CHAIN_ID);
  }
}

/**
 * Get current connected wallet
 */
export function getConnectedWallet(): ConnectedWallet | null {
  return connectedWallets.get(TERRA_CLASSIC_CHAIN_ID) || null;
}

/**
 * Get current connected address
 */
export function getCurrentTerraAddress(): string | null {
  const wallet = connectedWallets.get(TERRA_CLASSIC_CHAIN_ID);
  return wallet ? wallet.address : null;
}

/**
 * Check if wallet is connected
 */
export function isTerraWalletConnected(): boolean {
  return connectedWallets.has(TERRA_CLASSIC_CHAIN_ID);
}

/**
 * Estimate fee for Terra Classic transaction
 * Terra Classic LCD doesn't support simulation endpoint, so we use fixed gas limits
 */
function estimateTerraClassicFee(gasLimit: number): Fee {
  const feeAmount = Math.ceil(parseFloat(GAS_PRICE_ULUNA) * gasLimit);
  
  return new Fee({
    amount: [
      {
        amount: feeAmount.toString(),
        denom: 'uluna',
      },
    ],
    gasLimit: BigInt(gasLimit),
  });
}

/**
 * Execute a CW20 Send message (for referral registration)
 */
export async function executeCw20Send(
  tokenAddress: string,
  recipientContract: string,
  amount: string,
  embeddedMsg: object
): Promise<{ txHash: string }> {
  const wallet = connectedWallets.get(TERRA_CLASSIC_CHAIN_ID);
  if (!wallet) {
    throw new Error('Wallet not connected');
  }

  // CW20 Send message - the msg field needs to be base64 encoded
  const sendMsg = {
    send: {
      contract: recipientContract,
      amount: amount,
      msg: btoa(JSON.stringify(embeddedMsg)), // base64 encode the embedded message
    },
  };

  try {
    // Create the MsgExecuteContract message
    const msg = new MsgExecuteContract({
      sender: wallet.address,
      contract: tokenAddress,
      msg: sendMsg,
      funds: [],
    });

    // Create unsigned transaction
    const unsignedTx: UnsignedTx = {
      msgs: [msg],
      memo: '',
    };

    // Estimate fee using fixed gas limits (Terra Classic doesn't support simulation)
    const fee = estimateTerraClassicFee(CW20_SEND_GAS_LIMIT);

    // Broadcast transaction
    const txHash = await wallet.broadcastTx(unsignedTx, fee);

    // Poll for transaction confirmation
    const { txResponse } = await wallet.pollTx(txHash);

    // Check if transaction failed
    if (txResponse.code !== 0) {
      const errorMsg = txResponse.rawLog || `Transaction failed with code ${txResponse.code}`;
      throw new Error(errorMsg);
    }

    return { txHash };
  } catch (error) {
    console.error('Transaction execution failed:', error);
    throw error;
  }
}

// Extend window types for wallet detection
declare global {
  interface Window {
    station?: {
      connect: () => Promise<void>;
      disconnect: () => Promise<void>;
    };
    keplr?: {
      enable: (chainId: string) => Promise<void>;
      getOfflineSigner: (chainId: string) => unknown;
    };
    leap?: {
      enable: (chainId: string) => Promise<void>;
      getOfflineSigner: (chainId: string) => unknown;
    };
    cosmostation?: {
      providers: {
        keplr: unknown;
      };
    };
  }
}
