import React from 'react';
import { LuraphDeobfuscator, DeobfuscationProgress } from '@/lib/luraph/LuraphDeobfuscator';

// Real deobfuscation function using the LuraphDeobfuscator
export const deobfuscateLuaScript = async (script: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const deobfuscator = new LuraphDeobfuscator((progress: DeobfuscationProgress) => {
      // Progress callback for UI updates
      console.log(`Deobfuscation progress: ${progress.step} (${progress.progress.toFixed(1)}%)`);
    });

    deobfuscator.deobfuscate(script)
      .then(result => {
        if (result.success && result.deobfuscatedCode) {
          resolve(result.deobfuscatedCode);
        } else {
          // Provide more specific error messages
          let errorMessage = result.error || 'Deobfuscation failed';
          
          if (errorMessage.includes('not appear to be a valid Luraph')) {
            errorMessage = 'This file does not appear to be obfuscated with Luraph. Please ensure you are uploading a Luraph-obfuscated Lua script.';
          } else if (errorMessage.includes('No VM handlers found')) {
            errorMessage = 'No VM handlers detected. This script may use an unsupported Luraph version or obfuscation method.';
          } else if (errorMessage.includes('validation failed')) {
            errorMessage = 'The script is too heavily obfuscated or uses unsupported obfuscation techniques.';
          }
          
          reject(new Error(errorMessage));
        }
      })
      .catch(error => {
        // Provide user-friendly error messages
        let errorMessage = error.message || 'An unexpected error occurred';
        
        if (errorMessage.includes('Failed to tokenize')) {
          errorMessage = 'Invalid Lua syntax detected. Please ensure the file is a valid Lua script.';
        } else if (errorMessage.includes('Parse error')) {
          errorMessage = 'Failed to parse the Lua code. The file may be corrupted or not a valid Lua script.';
        }
        
        reject(new Error(errorMessage));
      });
  });
};

// Component for showing deobfuscation status and progress
interface DeobfuscationStatusProps {
  isProcessing: boolean;
  progress: number;
  currentStep: string;
}

export const DeobfuscationStatus: React.FC<DeobfuscationStatusProps> = ({
  isProcessing,
  progress,
  currentStep
}) => {
  if (!isProcessing) return null;

  return (
    <div className="space-y-4 p-6 bg-gradient-card border border-border rounded-lg shadow-card">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">Deobfuscating Script</h3>
        <span className="text-sm text-muted-foreground">{Math.round(progress)}%</span>
      </div>
      
      <div className="w-full bg-secondary rounded-full h-2">
        <div 
          className="bg-gradient-primary h-2 rounded-full transition-all duration-300 shadow-glow"
          style={{ width: `${progress}%` }}
        />
      </div>
      
      <p className="text-sm text-muted-foreground">{currentStep}</p>
    </div>
  );
};
