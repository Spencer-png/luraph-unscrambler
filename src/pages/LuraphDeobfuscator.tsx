import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { FileUpload } from '@/components/FileUpload';
import { CodeEditor } from '@/components/CodeEditor';
import { DeobfuscationStatus, deobfuscateLuaScript } from '@/components/DeobfuscationEngine';
import { useToast } from '@/hooks/use-toast';
import { Zap, Github, Shield, Code } from 'lucide-react';

const LuraphDeobfuscator = () => {
  const [inputCode, setInputCode] = useState('');
  const [outputCode, setOutputCode] = useState('');
  const [fileName, setFileName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const { toast } = useToast();

  const deobfuscationSteps = [
    'Parsing Lua file...',
    'Building abstract syntax tree...',
    'Detecting VM handlers...',
    'Finding encryption information...',
    'Decrypting bytecode...',
    'Removing antidecompiler tricks...',
    'Optimizing bytecode...',
    'Generating output file...'
  ];

  const handleFileContent = (content: string, name: string) => {
    setInputCode(content);
    setFileName(name);
    setOutputCode('');
  };

  const handleClear = () => {
    setInputCode('');
    setOutputCode('');
    setFileName('');
  };

  const handleDeobfuscate = async () => {
    if (!inputCode.trim()) {
      toast({
        title: "No input provided",
        description: "Please upload a file or paste your obfuscated Lua code.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setOutputCode('');

    try {
      // Simulate progress through deobfuscation steps
      for (let i = 0; i < deobfuscationSteps.length; i++) {
        setCurrentStep(deobfuscationSteps[i]);
        setProgress((i / deobfuscationSteps.length) * 100);
        await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 700));
      }

      const result = await deobfuscateLuaScript(inputCode);
      setOutputCode(result);
      setProgress(100);
      setCurrentStep('Deobfuscation completed successfully!');

      toast({
        title: "Deobfuscation complete",
        description: "Your Lua script has been successfully deobfuscated.",
      });
    } catch (error) {
      toast({
        title: "Deobfuscation failed",
        description: "An error occurred while processing your script.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card shadow-card">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-gradient-primary rounded-lg shadow-glow">
                <Shield className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Luraph Deobfuscator</h1>
                <p className="text-sm text-muted-foreground">Advanced Lua script deobfuscation tool</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Button variant="outline" asChild>
                <a href="https://github.com/PhoenixZeng/LuraphDeobfuscator" target="_blank" rel="noopener noreferrer">
                  <Github className="h-4 w-4" />
                  Source Code
                </a>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="space-y-8">
          {/* Description */}
          <div className="text-center space-y-4">
            <h2 className="text-3xl font-bold text-foreground">
              Deobfuscate Luraph Scripts
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Automatically reverse engineer and deobfuscate Lua scripts protected by Luraph obfuscation.
              Supports Luraph versions 11.5 to 11.8.1.
            </p>
            
            {/* Features */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
              <div className="p-6 bg-gradient-card border border-border rounded-lg shadow-card">
                <Code className="h-8 w-8 text-primary mx-auto mb-3" />
                <h3 className="font-semibold text-foreground mb-2">Advanced Analysis</h3>
                <p className="text-sm text-muted-foreground">
                  Sophisticated AST parsing and VM handler detection
                </p>
              </div>
              <div className="p-6 bg-gradient-card border border-border rounded-lg shadow-card">
                <Zap className="h-8 w-8 text-primary mx-auto mb-3" />
                <h3 className="font-semibold text-foreground mb-2">Fast Processing</h3>
                <p className="text-sm text-muted-foreground">
                  Optimized algorithms for quick deobfuscation
                </p>
              </div>
              <div className="p-6 bg-gradient-card border border-border rounded-lg shadow-card">
                <Shield className="h-8 w-8 text-primary mx-auto mb-3" />
                <h3 className="font-semibold text-foreground mb-2">Secure & Private</h3>
                <p className="text-sm text-muted-foreground">
                  Your scripts are processed locally and never stored
                </p>
              </div>
            </div>
          </div>

          {/* File Upload */}
          <FileUpload 
            onFileContent={handleFileContent}
            onClear={handleClear}
            isProcessing={isProcessing}
          />

          {/* Processing Status */}
          {isProcessing && (
            <DeobfuscationStatus 
              isProcessing={isProcessing}
              progress={progress}
              currentStep={currentStep}
            />
          )}

          {/* Code Input/Output */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <CodeEditor
                title="Input Code"
                value={inputCode}
                onChange={setInputCode}
                placeholder="// Paste your obfuscated Lua code here or upload a file above..."
              />
              <Button 
                onClick={handleDeobfuscate}
                disabled={isProcessing || !inputCode.trim()}
                variant="hero"
                size="lg"
                className="w-full"
              >
                <Zap className="h-5 w-5" />
                {isProcessing ? 'Deobfuscating...' : 'Deobfuscate Script'}
              </Button>
            </div>
            
            <CodeEditor
              title="Deobfuscated Output"
              value={outputCode}
              readOnly
              placeholder="// Deobfuscated code will appear here..."
              showDownload={!!outputCode}
              fileName={fileName ? fileName.replace('.lua', '.luac') : 'deobfuscated.luac'}
            />
          </div>

          {/* Warning */}
          <div className="p-6 bg-warning/10 border border-warning/20 rounded-lg">
            <h3 className="font-semibold text-warning mb-2">⚠️ Important Notice</h3>
            <p className="text-sm text-muted-foreground">
              This tool is for educational and security research purposes only. 
              Please ensure you have proper authorization before deobfuscating any scripts.
              The original Luraph Deobfuscator requires Java 8 to run.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card mt-16">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center space-y-2">
            <p className="text-muted-foreground">
              Based on the work by TheGreatSageEqualToHeaven
            </p>
            <p className="text-sm text-muted-foreground">
              This is a web interface demonstration. For production use, deploy the original Java application.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LuraphDeobfuscator;