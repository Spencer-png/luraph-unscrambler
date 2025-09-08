import { VMProto, VMInstruction, VMConstant, LuaOpcode } from './types/VMInstructions';

export class LuacGenerator {
  private static readonly LUA_SIGNATURE = 0x1B4C7561; // "\x1BLua"
  private static readonly LUAC_VERSION = 0x53; // Lua 5.3
  private static readonly LUAC_FORMAT = 0;
  private static readonly LUAC_DATA = "\x19\x93\r\n\x1a\n";

  public generateLuac(proto: VMProto): Uint8Array {
    const buffer = new ArrayBuffer(1024 * 64); // 64KB initial buffer
    const dataView = new DataView(buffer);
    let offset = 0;

    // Write Lua header
    offset = this.writeHeader(dataView, offset);

    // Write main function prototype
    offset = this.writeFunction(dataView, offset, proto);

    // Return the used portion of the buffer
    return new Uint8Array(buffer.slice(0, offset));
  }

  private writeHeader(dataView: DataView, offset: number): number {
    // Lua signature
    dataView.setUint32(offset, LuacGenerator.LUA_SIGNATURE, true);
    offset += 4;

    // Version
    dataView.setUint8(offset, LuacGenerator.LUAC_VERSION);
    offset += 1;

    // Format
    dataView.setUint8(offset, LuacGenerator.LUAC_FORMAT);
    offset += 1;

    // Data to catch conversion errors
    const luacData = LuacGenerator.LUAC_DATA;
    for (let i = 0; i < luacData.length; i++) {
      dataView.setUint8(offset, luacData.charCodeAt(i));
      offset += 1;
    }

    // Size of int, size_t, Instruction, lua_Integer, lua_Number
    dataView.setUint8(offset, 4); // sizeof(int)
    offset += 1;
    dataView.setUint8(offset, 8); // sizeof(size_t)
    offset += 1;
    dataView.setUint8(offset, 4); // sizeof(Instruction)
    offset += 1;
    dataView.setUint8(offset, 8); // sizeof(lua_Integer)
    offset += 1;
    dataView.setUint8(offset, 8); // sizeof(lua_Number)
    offset += 1;

    // Lua integers and numbers for validation
    dataView.setBigInt64(offset, BigInt(0x5678), true);
    offset += 8;
    dataView.setFloat64(offset, 370.5, true);
    offset += 8;

    return offset;
  }

  private writeFunction(dataView: DataView, offset: number, proto: VMProto): number {
    // Source name
    if (proto.source) {
      offset = this.writeString(dataView, offset, proto.source);
    } else {
      offset = this.writeString(dataView, offset, "@deobfuscated.lua");
    }

    // Line defined
    dataView.setUint32(offset, proto.lineDefined, true);
    offset += 4;

    // Last line defined
    dataView.setUint32(offset, proto.lastLineDefined, true);
    offset += 4;

    // Number of parameters
    dataView.setUint8(offset, proto.numParams);
    offset += 1;

    // Is vararg
    dataView.setUint8(offset, proto.isVararg ? 1 : 0);
    offset += 1;

    // Max stack size
    dataView.setUint8(offset, Math.max(proto.maxStackSize, 2));
    offset += 1;

    // Instructions
    dataView.setUint32(offset, proto.instructions.length, true);
    offset += 4;
    for (const instruction of proto.instructions) {
      dataView.setUint32(offset, this.encodeInstruction(instruction), true);
      offset += 4;
    }

    // Constants
    dataView.setUint32(offset, proto.constants.length, true);
    offset += 4;
    for (const constant of proto.constants) {
      offset = this.writeConstant(dataView, offset, constant);
    }

    // Upvalues
    dataView.setUint32(offset, proto.upvalues.length, true);
    offset += 4;
    for (const upvalue of proto.upvalues) {
      dataView.setUint8(offset, upvalue.isLocal ? 1 : 0);
      offset += 1;
      dataView.setUint8(offset, upvalue.register);
      offset += 1;
    }

    // Nested functions
    dataView.setUint32(offset, proto.protos.length, true);
    offset += 4;
    for (const nestedProto of proto.protos) {
      offset = this.writeFunction(dataView, offset, nestedProto);
    }

    // Debug info (simplified)
    offset = this.writeDebugInfo(dataView, offset, proto);

    return offset;
  }

  private writeString(dataView: DataView, offset: number, str: string): number {
    if (!str) {
      dataView.setUint8(offset, 0);
      return offset + 1;
    }

    const strBytes = new TextEncoder().encode(str);
    
    // Write size (including null terminator)
    dataView.setUint8(offset, strBytes.length + 1);
    offset += 1;

    // Write string bytes
    for (let i = 0; i < strBytes.length; i++) {
      dataView.setUint8(offset, strBytes[i]);
      offset += 1;
    }

    // Null terminator
    dataView.setUint8(offset, 0);
    offset += 1;

    return offset;
  }

  private writeConstant(dataView: DataView, offset: number, constant: VMConstant): number {
    switch (constant.type) {
      case 'nil':
        dataView.setUint8(offset, 0); // LUA_TNIL
        offset += 1;
        break;

      case 'boolean':
        dataView.setUint8(offset, 1); // LUA_TBOOLEAN
        offset += 1;
        dataView.setUint8(offset, constant.value ? 1 : 0);
        offset += 1;
        break;

      case 'number':
        if (Number.isInteger(constant.value)) {
          dataView.setUint8(offset, 3); // LUA_TNUMINT
          offset += 1;
          dataView.setBigInt64(offset, BigInt(constant.value), true);
          offset += 8;
        } else {
          dataView.setUint8(offset, 19); // LUA_TNUMFLT
          offset += 1;
          dataView.setFloat64(offset, constant.value, true);
          offset += 8;
        }
        break;

      case 'string':
        dataView.setUint8(offset, 4); // LUA_TSHRSTR or LUA_TLNGSTR
        offset += 1;
        offset = this.writeString(dataView, offset, constant.value);
        break;

      default:
        // Default to nil for unknown types
        dataView.setUint8(offset, 0);
        offset += 1;
        break;
    }

    return offset;
  }

  private encodeInstruction(instruction: VMInstruction): number {
    // Encode Lua instruction in Lua 5.3 format
    let encoded = 0;

    // Opcode (6 bits)
    encoded |= instruction.opcode & 0x3F;

    // Register A (8 bits)
    encoded |= (instruction.a & 0xFF) << 6;

    // Determine instruction format and encode operands
    if (instruction.bx !== undefined) {
      // OP_Bx format (18 bits for Bx)
      encoded |= (instruction.bx & 0x3FFFF) << 14;
    } else if (instruction.sbx !== undefined) {
      // OP_sBx format (18 bits for sBx)
      const sBx = instruction.sbx + 131071; // Bias for signed value
      encoded |= (sBx & 0x3FFFF) << 14;
    } else if (instruction.ax !== undefined) {
      // OP_Ax format (26 bits for Ax)
      encoded |= (instruction.ax & 0x3FFFFFF) << 6;
    } else {
      // OP_ABC format (9 bits each for B and C)
      encoded |= (instruction.b & 0x1FF) << 23;
      encoded |= (instruction.c & 0x1FF) << 14;
    }

    return encoded;
  }

  private writeDebugInfo(dataView: DataView, offset: number, proto: VMProto): number {
    // Line info
    dataView.setUint32(offset, proto.instructions.length, true);
    offset += 4;
    for (const instruction of proto.instructions) {
      dataView.setUint32(offset, instruction.line || 0, true);
      offset += 4;
    }

    // Local variables (simplified - no locals for now)
    dataView.setUint32(offset, 0, true);
    offset += 4;

    // Upvalue names (simplified)
    dataView.setUint32(offset, proto.upvalues.length, true);
    offset += 4;
    for (const upvalue of proto.upvalues) {
      offset = this.writeString(dataView, offset, upvalue.name || "");
    }

    return offset;
  }

  // Helper method to create a basic function prototype
  public static createBasicProto(source: string = "@deobfuscated.lua"): VMProto {
    return {
      instructions: [
        {
          opcode: LuaOpcode.LOADK,
          a: 0,
          bx: 0,
          line: 1
        },
        {
          opcode: LuaOpcode.CALL,
          a: 0,
          b: 1,
          c: 1,
          line: 1
        },
        {
          opcode: LuaOpcode.RETURN,
          a: 0,
          b: 1,
          c: 0,
          line: 1
        }
      ],
      constants: [
        {
          type: 'string',
          value: 'print',
          index: 0
        }
      ],
      upvalues: [],
      protos: [],
      source,
      lineDefined: 0,
      lastLineDefined: 1,
      numParams: 0,
      isVararg: false,
      maxStackSize: 2
    };
  }

  // Validate the generated bytecode
  public validateLuac(bytecode: Uint8Array): boolean {
    try {
      const dataView = new DataView(bytecode.buffer);
      
      // Check signature
      const signature = dataView.getUint32(0, true);
      if (signature !== LuacGenerator.LUA_SIGNATURE) {
        return false;
      }

      // Check version
      const version = dataView.getUint8(4);
      if (version !== LuacGenerator.LUAC_VERSION) {
        return false;
      }

      // Basic validation passed
      return true;
    } catch (error) {
      console.error('Luac validation failed:', error);
      return false;
    }
  }
}