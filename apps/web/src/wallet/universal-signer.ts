export type Hex = `0x${string}`;

export interface UniversalSigner {
  kind: "eip1193" | "local-account" | "worldapp";
  getAddress(): Promise<Hex>;
  signMessage(message: string): Promise<Hex>;
  signTypedData?<TTypedData extends Record<string, unknown>>(
    typedData: TTypedData,
  ): Promise<Hex>;
}
