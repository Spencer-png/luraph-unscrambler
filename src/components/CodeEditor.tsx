import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface CodeEditorProps {
  title: string;
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  showDownload?: boolean;
  fileName?: string;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  title,
  value,
  onChange,
  readOnly = false,
  placeholder = "// No content yet...",
  showDownload = false,
  fileName = "output.luac"
}) => {
  const { toast } = useToast();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast({
        title: "Copied to clipboard",
        description: "Content has been copied to your clipboard.",
      });
    } catch (err) {
      toast({
        title: "Failed to copy",
        description: "Could not copy content to clipboard.",
        variant: "destructive",
      });
    }
  };

  const handleDownload = () => {
    const blob = new Blob([value], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Download started",
      description: `${fileName} has been downloaded.`,
    });
  };

  return (
    <Card className="flex flex-col h-full bg-gradient-card border-border shadow-card">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <div className="flex space-x-2">
          {value && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="text-muted-foreground hover:text-foreground"
            >
              <Copy className="h-4 w-4" />
            </Button>
          )}
          {showDownload && value && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDownload}
              className="text-muted-foreground hover:text-foreground"
            >
              <Download className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 p-0">
        <textarea
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          readOnly={readOnly}
          placeholder={placeholder}
          className="w-full h-full min-h-[400px] p-4 bg-transparent border-none outline-none resize-none font-mono text-sm text-foreground placeholder:text-muted-foreground code-editor"
          spellCheck={false}
        />
      </div>
    </Card>
  );
};