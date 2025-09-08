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
          reject(new Error(result.error || 'Deobfuscation failed'));
        }
      })
      .catch(error => {
        reject(error);
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
