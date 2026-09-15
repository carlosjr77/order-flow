import React, { useEffect, useRef, useState } from 'react';
import { Download, Loader2, Printer, X } from 'lucide-react';
import { apiClient } from '../services/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const DANFE_ERROR = 'Não foi possível gerar a DANFE: a NF-e ainda não foi autorizada ou não está disponível.';

type DanfeViewerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendaId: number | null | undefined;
};

export const DanfeViewerDialog: React.FC<DanfeViewerDialogProps> = ({ open, onOpenChange, vendaId }) => {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState('DANFE.pdf');
  const [isLoading, setIsLoading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!open || !vendaId) return;
    setIsLoading(true);
    limparPdf();
    apiClient.obterDanfeNFe(vendaId)
      .then((resultado) => {
        setPdfUrl(URL.createObjectURL(resultado.blob));
        setNomeArquivo(resultado.filename);
      })
      .catch((error) => {
        console.error('Erro ao carregar DANFE autorizada:', error);
        alert(DANFE_ERROR);
      })
      .finally(() => setIsLoading(false));
  }, [open, vendaId]);

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  const limparPdf = () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl(null);
    setNomeArquivo('DANFE.pdf');
  };

  const fechar = () => {
    limparPdf();
    onOpenChange(false);
  };

  const imprimir = () => iframeRef.current?.contentWindow?.print();

  const baixar = () => {
    if (!pdfUrl) return;
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = nomeArquivo;
    link.click();
  };

  return (
    <Dialog open={open} onOpenChange={(value) => value ? onOpenChange(true) : fechar()}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-5xl h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="flex-row items-center justify-between border-b px-5 py-4 space-y-0">
          <DialogTitle>Visualização da DANFE</DialogTitle>
          <Button variant="ghost" size="icon" onClick={fechar} aria-label="Fechar">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        {isLoading && (
          <div className="flex flex-1 items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Gerando DANFE...
          </div>
        )}

        {pdfUrl && !isLoading && (
          <>
            <div className="flex items-center justify-end gap-2 border-b px-5 py-3">
              <Button variant="outline" size="sm" onClick={imprimir}>
                <Printer className="mr-2 h-4 w-4" />
                Imprimir
              </Button>
              <Button size="sm" onClick={baixar}>
                <Download className="mr-2 h-4 w-4" />
                Baixar PDF
              </Button>
              <Button variant="ghost" size="sm" onClick={fechar}>
                Fechar
              </Button>
            </div>
            <iframe ref={iframeRef} src={pdfUrl} title="DANFE" className="min-h-0 flex-1 w-full" />
          </>
        )}

        {!pdfUrl && !isLoading && (
          <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
            {DANFE_ERROR}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
