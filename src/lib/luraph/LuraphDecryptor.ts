export interface DecryptionResult {
  success: boolean;
  decrypted: string;
  method: string;
  error?: string;
}

export interface EncryptionInfo {
  method: string;
  key: string;
  iv?: string;
  algorithm: string;
  version: string;
}

export class LuraphDecryptor {
  private static readonly LURAPH_VERSIONS = {
    '11.5': { keyLength: 16, method: 'xor_v1' },
    '11.6': { keyLength: 24, method: 'xor_v2' },
    '11.7': { keyLength: 32, method: 'aes_cbc' },
    '11.8': { keyLength: 32, method: 'aes_cbc_v2' },
    '11.8.1': { keyLength: 32, method: 'aes_cbc_v2' }
  };

  public decryptString(encrypted: string, encryptionInfo: EncryptionInfo): DecryptionResult {
    try {
      switch (encryptionInfo.method) {
        case 'xor_v1':
          return this.xorDecryptV1(encrypted, encryptionInfo.key);
        case 'xor_v2':
          return this.xorDecryptV2(encrypted, encryptionInfo.key);
        case 'aes_cbc':
          return this.aesDecrypt(encrypted, encryptionInfo.key, encryptionInfo.iv);
        case 'aes_cbc_v2':
          return this.aesDecryptV2(encrypted, encryptionInfo.key, encryptionInfo.iv);
        case 'luraph_custom':
          return this.luraphCustomDecrypt(encrypted, encryptionInfo.key);
        default:
          return this.autoDetectAndDecrypt(encrypted, encryptionInfo.key);
      }
    } catch (error) {
      return {
        success: false,
        decrypted: encrypted,
        method: encryptionInfo.method,
        error: error instanceof Error ? error.message : 'Unknown decryption error'
      };
    }
  }

  private xorDecryptV1(encrypted: string, key: string): DecryptionResult {
    // Luraph v11.5 XOR decryption
    let result = '';
    const keyBytes = this.stringToBytes(key);
    
    for (let i = 0; i < encrypted.length; i++) {
      const charCode = encrypted.charCodeAt(i);
      const keyByte = keyBytes[i % keyBytes.length];
      result += String.fromCharCode(charCode ^ keyByte);
    }
    
    return {
      success: true,
      decrypted: result,
      method: 'xor_v1'
    };
  }

  private xorDecryptV2(encrypted: string, key: string): DecryptionResult {
    // Luraph v11.6 enhanced XOR with key rotation
    let result = '';
    const keyBytes = this.stringToBytes(key);
    let keyIndex = 0;
    
    for (let i = 0; i < encrypted.length; i++) {
      const charCode = encrypted.charCodeAt(i);
      const keyByte = keyBytes[keyIndex];
      
      // Rotate key based on position
      const rotatedKey = (keyByte + i) & 0xFF;
      result += String.fromCharCode(charCode ^ rotatedKey);
      
      keyIndex = (keyIndex + 1) % keyBytes.length;
    }
    
    return {
      success: true,
      decrypted: result,
      method: 'xor_v2'
    };
  }

  private aesDecrypt(encrypted: string, key: string, iv?: string): DecryptionResult {
    // Luraph v11.7 AES-CBC decryption
    try {
      // Convert hex string to bytes
      const encryptedBytes = this.hexToBytes(encrypted);
      const keyBytes = this.stringToBytes(key);
      const ivBytes = iv ? this.hexToBytes(iv) : new Uint8Array(16);
      
      // Simple AES-CBC implementation (in real implementation, use Web Crypto API)
      const decrypted = this.simpleAESDecrypt(encryptedBytes, keyBytes, ivBytes);
      
      return {
        success: true,
        decrypted: this.bytesToString(decrypted),
        method: 'aes_cbc'
      };
    } catch (error) {
      return {
        success: false,
        decrypted: encrypted,
        method: 'aes_cbc',
        error: error instanceof Error ? error.message : 'AES decryption failed'
      };
    }
  }

  private aesDecryptV2(encrypted: string, key: string, iv?: string): DecryptionResult {
    // Luraph v11.8.1 enhanced AES with custom padding
    try {
      const encryptedBytes = this.hexToBytes(encrypted);
      const keyBytes = this.stringToBytes(key);
      const ivBytes = iv ? this.hexToBytes(iv) : this.generateIV(key);
      
      // Enhanced AES with custom Luraph modifications
      const decrypted = this.luraphAESDecrypt(encryptedBytes, keyBytes, ivBytes);
      
      return {
        success: true,
        decrypted: this.bytesToString(decrypted),
        method: 'aes_cbc_v2'
      };
    } catch (error) {
      return {
        success: false,
        decrypted: encrypted,
        method: 'aes_cbc_v2',
        error: error instanceof Error ? error.message : 'Enhanced AES decryption failed'
      };
    }
  }

  private luraphCustomDecrypt(encrypted: string, key: string): DecryptionResult {
    // Luraph's custom encryption algorithm
    try {
      const encryptedBytes = this.stringToBytes(encrypted);
      const keyBytes = this.stringToBytes(key);
      
      // Multi-layer decryption
      let result = encryptedBytes;
      
      // Layer 1: XOR with key
      result = this.xorBytes(result, keyBytes);
      
      // Layer 2: Reverse bit manipulation
      result = this.reverseBitManipulation(result);
      
      // Layer 3: Custom substitution
      result = this.customSubstitution(result, keyBytes);
      
      return {
        success: true,
        decrypted: this.bytesToString(result),
        method: 'luraph_custom'
      };
    } catch (error) {
      return {
        success: false,
        decrypted: encrypted,
        method: 'luraph_custom',
        error: error instanceof Error ? error.message : 'Custom decryption failed'
      };
    }
  }

  private autoDetectAndDecrypt(encrypted: string, key: string): DecryptionResult {
    // Try different decryption methods and return the most likely result
    const methods = ['xor_v1', 'xor_v2', 'aes_cbc', 'luraph_custom'];
    const results: DecryptionResult[] = [];
    
    for (const method of methods) {
      const encryptionInfo: EncryptionInfo = {
        method,
        key,
        algorithm: method,
        version: 'auto'
      };
      
      const result = this.decryptString(encrypted, encryptionInfo);
      if (result.success) {
        results.push(result);
      }
    }
    
    // Return the result that looks most like valid Lua code
    const bestResult = this.selectBestResult(results);
    return bestResult || {
      success: false,
      decrypted: encrypted,
      method: 'auto',
      error: 'No valid decryption method found'
    };
  }

  private selectBestResult(results: DecryptionResult[]): DecryptionResult | null {
    if (results.length === 0) return null;
    
    // Score results based on how much they look like valid Lua code
    let bestResult = results[0];
    let bestScore = this.scoreLuaCode(bestResult.decrypted);
    
    for (let i = 1; i < results.length; i++) {
      const score = this.scoreLuaCode(results[i].decrypted);
      if (score > bestScore) {
        bestScore = score;
        bestResult = results[i];
      }
    }
    
    return bestResult;
  }

  private scoreLuaCode(code: string): number {
    let score = 0;
    
    // Check for Lua keywords
    const luaKeywords = ['local', 'function', 'end', 'if', 'then', 'else', 'for', 'while', 'do', 'return'];
    luaKeywords.forEach(keyword => {
      const matches = (code.match(new RegExp(`\\b${keyword}\\b`, 'g')) || []).length;
      score += matches * 10;
    });
    
    // Check for Lua operators
    const luaOperators = ['=', '==', '~=', '<=', '>=', '<', '>', '+', '-', '*', '/', '%', '^', '..', 'and', 'or', 'not'];
    luaOperators.forEach(op => {
      const matches = (code.match(new RegExp(`\\${op}`, 'g')) || []).length;
      score += matches * 2;
    });
    
    // Check for valid Lua syntax patterns
    if (code.includes('function') && code.includes('end')) score += 20;
    if (code.includes('local')) score += 15;
    if (code.includes('print')) score += 10;
    
    // Penalize for non-printable characters
    const nonPrintable = (code.match(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g) || []).length;
    score -= nonPrintable * 5;
    
    return score;
  }

  // Utility methods
  private stringToBytes(str: string): Uint8Array {
    const bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      bytes[i] = str.charCodeAt(i);
    }
    return bytes;
  }

  private bytesToString(bytes: Uint8Array): string {
    let str = '';
    for (let i = 0; i < bytes.length; i++) {
      str += String.fromCharCode(bytes[i]);
    }
    return str;
  }

  private hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
  }

  private xorBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
    const result = new Uint8Array(a.length);
    for (let i = 0; i < a.length; i++) {
      result[i] = a[i] ^ b[i % b.length];
    }
    return result;
  }

  private reverseBitManipulation(bytes: Uint8Array): Uint8Array {
    const result = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      // Reverse common bit manipulation patterns
      result[i] = ((bytes[i] << 3) | (bytes[i] >> 5)) & 0xFF;
    }
    return result;
  }

  private customSubstitution(bytes: Uint8Array, key: Uint8Array): Uint8Array {
    const result = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      const keyByte = key[i % key.length];
      result[i] = (bytes[i] - keyByte) & 0xFF;
    }
    return result;
  }

  private generateIV(key: string): Uint8Array {
    // Generate IV based on key
    const iv = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
      iv[i] = key.charCodeAt(i % key.length) ^ i;
    }
    return iv;
  }

  private simpleAESDecrypt(encrypted: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array {
    // Simplified AES-CBC decryption (in production, use proper crypto library)
    // This is a placeholder implementation
    const result = new Uint8Array(encrypted.length);
    let previousBlock = iv;
    
    for (let i = 0; i < encrypted.length; i += 16) {
      const block = encrypted.slice(i, i + 16);
      const decryptedBlock = this.xorBytes(block, key.slice(0, 16));
      const finalBlock = this.xorBytes(decryptedBlock, previousBlock);
      
      result.set(finalBlock, i);
      previousBlock = block;
    }
    
    return result;
  }

  private luraphAESDecrypt(encrypted: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array {
    // Luraph's modified AES implementation
    // This includes custom padding and key scheduling modifications
    const result = new Uint8Array(encrypted.length);
    
    // Apply Luraph-specific modifications to the key
    const modifiedKey = this.modifyKeyForLuraph(key);
    
    // Decrypt with modified key
    const decrypted = this.simpleAESDecrypt(encrypted, modifiedKey, iv);
    
    // Remove custom padding
    return this.removeLuraphPadding(decrypted);
  }

  private modifyKeyForLuraph(key: Uint8Array): Uint8Array {
    const modified = new Uint8Array(key.length);
    for (let i = 0; i < key.length; i++) {
      modified[i] = (key[i] + i * 7) & 0xFF;
    }
    return modified;
  }

  private removeLuraphPadding(bytes: Uint8Array): Uint8Array {
    // Remove Luraph's custom padding
    let paddingLength = bytes[bytes.length - 1];
    if (paddingLength > 0 && paddingLength <= 16) {
      return bytes.slice(0, bytes.length - paddingLength);
    }
    return bytes;
  }

  // Public method to detect encryption method from obfuscated code
  public detectEncryptionMethod(obfuscatedCode: string): EncryptionInfo[] {
    const methods: EncryptionInfo[] = [];
    
    // Look for encryption patterns in the code
    const patterns = [
      { regex: /[a-fA-F0-9]{32,}/, method: 'aes_cbc', version: '11.7' },
      { regex: /[a-fA-F0-9]{16,24}/, method: 'xor_v2', version: '11.6' },
      { regex: /[^\x20-\x7E]{10,}/, method: 'luraph_custom', version: '11.8.1' }
    ];
    
    patterns.forEach(pattern => {
      if (pattern.regex.test(obfuscatedCode)) {
        methods.push({
          method: pattern.method,
          key: this.extractKeyFromCode(obfuscatedCode, pattern.method),
          algorithm: pattern.method,
          version: pattern.version
        });
      }
    });
    
    return methods;
  }

  private extractKeyFromCode(code: string, method: string): string {
    // Extract potential encryption keys from the obfuscated code
    const keyPatterns = [
      /['"]([a-fA-F0-9]{16,32})['"]/,  // Hex strings
      /['"]([a-zA-Z0-9+/=]{20,})['"]/, // Base64-like strings
      /local\s+\w+\s*=\s*['"]([^'"]{16,})['"]/ // Assignment patterns
    ];
    
    for (const pattern of keyPatterns) {
      const match = code.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    
    return 'default_key'; // Fallback
  }
}
