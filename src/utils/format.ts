const userIdLen = 16;
const prefix0xLen = 2;

export function isHex(s: string): boolean {
  return /^0x[a-zA-Z0-9]+/.test(s);
}

/**
 * @param address `"0x5a0b54d5dc17e0aadc383d2db43b0a0d3e029c4c"`
 * @returns "`5a0b54d5dc17e0aa"`
 */
export function getUserId(address: string): string {
  return address.toLowerCase().substring(prefix0xLen, prefix0xLen + userIdLen);
}
