import React, { useEffect, useRef, useState } from 'react';
import { Download, FileUp, Loader2, Printer, X } from 'lucide-react';
import { apiClient } from '../services/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const DANFE_ERROR = 'Não foi possível gerar a DANFE: O XML da nota fiscal não foi localizado ou é inválido.';

type DanfeViewerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  xml?: string | null;
  vendaId?: number | null;
};

export const DanfeViewerDialog: React.FC<DanfeViewerDialogProps> = ({ open, onOpenChange, xml, vendaId }) => {
  const [xmlTexto, setXmlTexto] = useState(xml || '');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState('DANFE.pdf');
  const [isLoading, setIsLoading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    setXmlTexto(xml || '');
  }, [xml, open]);

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

  const gerarPdf = async (xmlParaGerar = xmlTexto) => {
    if (!xmlParaGerar.trim()) {
      alert(DANFE_ERROR);
      return;
    }

    setIsLoading(true);
    limparPdf();
    try {
      const resultado = await apiClient.gerarDanfe(xmlParaGerar);
      setPdfUrl(URL.createObjectURL(resultado.blob));
      setNomeArquivo(resultado.filename || 'DANFE.pdf');
    } catch (error) {
      console.error('Erro ao gerar DANFE:', error);
      alert(DANFE_ERROR);
    } finally {
      setIsLoading(false);
    }
  };

  const carregarArquivo = (event: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = event.target.files?.[0];
    if (!arquivo) return;

    const leitor = new FileReader();
    leitor.onload = () => {
      const conteudo = typeof leitor.result === 'string' ? leitor.result : '';
      setXmlTexto(conteudo);
      void gerarPdf(conteudo);
    };
    leitor.onerror = () => alert(DANFE_ERROR);
    leitor.readAsText(arquivo);
    event.target.value = '';
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

        {!pdfUrl && !isLoading && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
            <FileUp className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">Selecione o XML autorizado da NFe</p>
              <p className="text-sm text-muted-foreground">O arquivo será enviado ao backend para gerar a DANFE.</p>
            </div>
            <label className="cursor-pointer">
              <span className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                Escolher XML
              </span>
              <input type="file" accept=".xml,text/xml,application/xml" className="sr-only" onChange={carregarArquivo} />
            </label>
            <textarea
              value={xmlTexto}
              onChange={(event) => setXmlTexto(event.target.value)}
              placeholder="Ou cole o XML da NFe aqui"
              className="min-h-32 w-full max-w-2xl rounded-md border bg-background p-3 text-left text-xs"
            />
            <Button onClick={() => void gerarPdf()} disabled={!xmlTexto.trim()}>
              Gerar DANFE
            </Button>
          </div>
        )}

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
      </DialogContent>
    </Dialog>
  );
};
