import { X, Calculator, Wind, Waves, Compass } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface ManualModalProps {
  onClose: () => void;
}

const manualContent = `
## Como funciona o planejamento de viagem com Inteligência Ambiental

O sistema utiliza os dados inseridos (navio e waypoints da rota original) em conjunto com previsões meteorológicas e oceanográficas avançadas para recalcular a viabilidade da rota e o horário de chegada esperado (EnviroETA).

### 1. Sequência de Utilização

1. **Ship Static & Variable Data:** Preencha os dados do navio. Os dados varíaveis essenciais são:
   - **Disp:** Deslocamento do navio (toneladas).
   - **Draft:** Calado do navio (metros).
   - **WindArea:** Área lateral ou frontal exposta à ação do vento (em $m^2$).
   - **RPM:** Rotações por minuto do motor principal.
2. **Temporal Details:** Defina o ETD base para partida.
3. **Waypoint Sequence Paste:** Insira os waypoints da rota pretendida em formato padrão.
4. **Cálculo da Rota:** O sistema processa os dados, conecta-se a provedores de dados meteoceanográficos em tempo real e emite o Planejamento.

---

### 2. Route Environment Intelligence - Cálculos Matemáticos

A partir do segundo waypoint (WP2), calcula-se o **$SOG_{Max}(WP_n)$** para a perna (distância até o wp alvo), o qual determina a velocidade máxima esperada sobre a água.

$$SOG_{Max}(WP_n) = V_{base} + V_{corr} + V_{vento} + V_{ondas}$$

A fórmula completa se traduz em:

$$
\\begin{aligned}
SOG_{Max}(WP_n) & = \\left(23.2 - 0.36 \\cdot (Draft - 8.1)^2 - 0.00058 \\cdot (Disp^{\\frac{2}{3}})\\right) \\cdot \\left(\\frac{RPM}{92}\\right)^{0.65} \\\\
& + CurrentSpeed \\cdot \\cos(\\text{COG} - CurrentDir) \\\\
& - 2.55 \\cdot 10^{-7} \\cdot WindArea \\cdot WindSpeed^2 \\cdot \\cos(\\text{COG} - WindDir) \\\\
& - 0.716 \\cdot WaveHeight^{1.1} \\cdot \\cos(\\text{COG} - WaveDir) \\cdot \\left(1 + 0.7 \\cdot \\exp\\left\\{-\\frac{(WavePeriod - 8.1)^2}{2 \\cdot 1.5^2}\\right\\}\\right)
\\end{aligned}
$$

#### Descrição Detalhada das Variáveis
*   **COG (Course Over Ground):** Rumo Verdadeiro entre o waypoint anterior e o waypoint $n$.
*   **CurrentSpeed:** Velocidade da corrente marítima local ($n\\acute{o}s$).
*   **CurrentDir:** Direção da corrente marítima ($graus$).
*   **WindSpeed:** Velocidade do vento ($n\\acute{o}s$).
*   **WindDir:** Direção do vento ($graus$).
*   **WaveHeight:** Altura significativa da onda ($metros$).
*   **WaveDir:** Direção de propagação das ondas ($graus$).
*   **WavePeriod:** Período de pico das ondas ($segundos$).

#### Fatores da Equação
A fórmula deduz atritos e perdas de potência no propulsor. 
- A primeira parte calcula a velocidade base no casco reduzida pelo deslocamento e variação de calado.
- Os fatores seguintes compensam correntes superficiais (contribuindo ou reduzindo velocidade diretamente), arrasto aerodinâmico pelo *WindArea* e resistência associada às ondas através de fator ressonante do período de pico.

---

### 3. Voyage Analytics

Após os trechos terem suas restrições ambientais calculadas, computa-se a média global:

$$SOG_{avg\\_max} = \\frac{\\sum_{n=1}^{k} d_n}{\\sum_{n=1}^{k} \\left( \\frac{d_n}{SOG_{Max}(WP_n)} \\right)}$$

Onde $d_n$ é a distância de cada perna.
Baseado nesse fator de restrição final, o sistema propõe:
- **Weighted Total Enroute Time:** $Total Distance / SOG_{avg\\_max}$
- **Proposed ETA (EnviroETA):** Fator horário projetado pelo deslocamento ao longo de toda a rota sob efeito do ambiente imposto. Calculado sobre a longitude do alvo (Time Zone).
`;

export function ManualModal({ onClose }: ManualModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0f172a] border border-cyan-900/50 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden relative">
        <div className="bg-slate-900/80 p-4 border-b border-slate-800 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-cyan-900/40 flex items-center justify-center text-cyan-400">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-200">Manual do Usuário</h2>
              <div className="text-[10px] text-cyan-500 font-mono tracking-widest uppercase">Inteligência Ambiental e Roteirização</div>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white hover:bg-slate-800 p-2 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto w-full custom-scrollbar pr-4 markdown-body text-slate-300">
           <ReactMarkdown 
              remarkPlugins={[remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={{
                 h2: ({node, ...props}) => <h2 className="text-xl font-bold text-white mb-4 mt-6 first:mt-0 font-sans border-b border-slate-800 pb-2" {...props} />,
                 h3: ({node, ...props}) => <h3 className="text-lg font-bold text-cyan-400 mt-6 mb-3 font-sans" {...props} />,
                 h4: ({node, ...props}) => <h4 className="text-sm font-bold text-slate-400 mt-4 mb-2 uppercase tracking-wide font-sans" {...props} />,
                 p: ({node, ...props}) => <p className="mb-4 leading-relaxed font-sans text-sm" {...props} />,
                 ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-4 space-y-2 text-sm" {...props} />,
                 li: ({node, ...props}) => <li className="text-slate-300" {...props} />,
                 hr: ({node, ...props}) => <hr className="border-slate-800 my-8" {...props} />,
                 strong: ({node, ...props}) => <strong className="text-white font-bold" {...props} />,
                 em: ({node, ...props}) => <em className="text-cyan-200 italic" {...props} />
              }}
           >
             {manualContent}
           </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
