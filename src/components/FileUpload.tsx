import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, File, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

interface FileUploadProps {
  onFileContent: (content: string, fileName: string) => void;
  onClear: () => void;
  isProcessing: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileContent, onClear, isProcessing }) => {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const { toast } = useToast();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    if (!file.name.endsWith('.lua')) {
      toast({
        title: "Invalid file type",
        description: "Please upload a .lua file",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      onFileContent(content, file.name);
      setUploadedFile(file);
    };
    reader.readAsText(file);
  }, [onFileContent, toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/x-lua': ['.lua'],
    },
    multiple: false,
    disabled: isProcessing,
  });

  const handleClear = () => {
    setUploadedFile(null);
    onClear();
  };

  return (
    <Card className="p-6 bg-gradient-card border-border shadow-card">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">Upload Obfuscated Script</h3>
          {uploadedFile && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleClear}
              disabled={isProcessing}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {!uploadedFile ? (
          <div
            {...getRootProps()}
            className={`
              border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-200
              ${isDragActive 
                ? 'border-primary bg-gradient-upload shadow-glow' 
                : 'border-border hover:border-accent bg-gradient-upload'
              }
              ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <input {...getInputProps()} />
            <Upload className={`mx-auto h-12 w-12 mb-4 ${isDragActive ? 'text-primary' : 'text-muted-foreground'}`} />
            <p className="text-foreground font-medium mb-2">
              {isDragActive ? 'Drop your Lua file here' : 'Drag & drop a Lua file here'}
            </p>
            <p className="text-muted-foreground text-sm mb-4">
              or click to browse files
            </p>
            <Button variant="secondary" disabled={isProcessing}>
              Select File
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between p-4 bg-secondary rounded-lg border border-border">
            <div className="flex items-center space-x-3">
              <File className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium text-foreground">{uploadedFile.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(uploadedFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};