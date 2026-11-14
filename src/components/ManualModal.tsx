import { X, Calculator, Wind, Waves, Compass } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface ManualModalProps {
  onClose: () => void;
}

const manualContent = `
## Introdução

O **Trip Planner (SISTRAM Type 1)** é uma ferramenta essencial para a navegação moderna, projetado para fundir inteligência ambiental com dados físicos e dinâmicos de embarcações. No complexo cenário marítimo da atualidade, planejar uma rota não se resume apenas a traçar a menor distância entre dois pontos. É necessário otimizar recursos, prever perigos, reduzir emissões de carbono e garantir a integridade da carga, do navio e de toda sua tripulação. 

A importância deste sistema reside em sua capacidade de mitigar os riscos associados ao clima adverso, calculando em tempo real restrições oceanográficas e impactos dinâmicos ("Seakeeping") sobre o navio. Através dos módulos integrados de **Voyage Planner** e **Motion Simulator**, a plataforma proporciona maior segurança, precisão na projeção de horários de chegada (ETA) e eficiência energética.

---

## Módulo: Voyage Planner

O Voyage Planner aplica cálculos hidrodinâmicos e ambientais a cada perna da rota (waypoints). A partir da resistência gerada por vento, correntes marítimas e ondas, estima a perda (ou ganho) de velocidade.

### 1. Modelagem Matemática de Velocidade Máxima

Para cada waypoint $n$, o sistema calcula a Velocidade Máxima Possível sobre a Água, denominada $SOG_{Max}(WP_n)$:

$$SOG_{Max}(WP_n) = V_{base} + V_{corr} + V_{vento} + V_{ondas}$$

A equação expandida é definida por:

$$
\\begin{aligned}
SOG_{Max}(WP_n) & = \\left(23.2 - 0.36 \\cdot (Draft - 8.1)^2 - 0.00058 \\cdot (Disp^{\\frac{2}{3}})\\right) \\cdot \\left(\\frac{RPM}{92}\\right)^{0.65} \\\\
& + CurrentSpeed \\cdot \\cos(\\text{COG} - CurrentDir) \\\\
& - 2.55 \\cdot 10^{-7} \\cdot WindArea \\cdot WindSpeed^2 \\cdot \\cos(\\text{COG} - WindDir) \\\\
& - 0.716 \\cdot WaveHeight^{1.1} \\cdot \\cos(\\text{COG} - WaveDir) \\cdot \\left(1 + 0.7 \\cdot \\exp\\left\\{-\\frac{(WavePeriod - 8.1)^2}{2 \\cdot 1.5^2}\\right\\}\\right)
\\end{aligned}
$$

#### Componentes
- **Rendimento Base no Casco:** Determinado pelo Deslocamento (Disp), Calado (Draft) e propulsão mecânica (RPM).
- **Corrente:** $CurrentSpeed \\cdot \\cos(\\text{COG} - CurrentDir)$. Compensa ou deduz velocidade caso a corrente empurre contra ou a favor do deslocamento.
- **Vento:** Atrito aerodinâmico calculado pela Área exposta (WindArea) e velocidade ao quadrado.
- **Ondas:** Atrito hidrodinâmico de ressonância da altura significativa ($WaveHeight$) e Período de Pico ($WavePeriod$).

### 2. Analytics e Projeção de Tempo (EnviroETA)

Baseado no somatório restritivo global dos ambientes de todos os Waypoints, é estabelecida uma média de deslocamento:

$$SOG_{avg\\_max} = \\frac{\\sum_{n=1}^{k} d_n}{\\sum_{n=1}^{k} \\left( \\frac{d_n}{SOG_{Max}(WP_n)} \\right)}$$

Com as perdas consolidadas, o sistema projeta o **Predicted ETA** compensando fuso horários ($Time Zones$), permitindo estimativas altamente confiáveis de atracação.

### 3. Interoperabilidade, Exportação GPX / RT3, OpenSeaMap e Vetores Metocean
O sistema oferece interoperabilidade completa com ecossistemas de navegação e ECDIS:
- **Vetores Metocean Diretos no Mapa (OpenMeteo):** Sobreposição gráfica de vetores direcionais e codificação por cores para **Velocidade do Vento** (Escala Beaufort: Verde <10kn, Amarelo 10-20kn, Laranja 21-33kn, Vermelho 34-47kn, Roxo ≥48kn) e **Altura Significativa de Onda** (Escala Douglas: Ciano <1.25m, Amarelo 1.25-2.5m, Laranja 2.5-4.0m, Vermelho 4.0-6.0m, Roxo ≥6.0m). Inclui setas de fluxo orientadas em convenção física/meteorológica, comprimento proporcional à magnitude e legenda interativa.
- **Integração OpenSeaMap (map.openseamap.org):** Cartografia náutica e auxílios à navegação abertos (faróis, boias, balizas, esquemas de separação de tráfego / TSS) com datum geodésico WGS84, sem necessidade de chaves de API proprietárias.
- **Importação RT3:** Importa arquivos de rotas ECDIS em formato .rt3.
- **Exportação GPX (GPS Exchange Format 1.1):** Exporta todos os waypoints da sequência em coordenadas geodésicas WGS84 com tags de waypoints, rotas planejadas e trajetos, prontos para importação em GPSs, plotters marítimos e softwares de navegação.

### 4. Monitoramento de Embarcação e AIS MarineTraffic (Call Sign: PPKQ)
O sistema incorpora monitoramento contínuo da posição e status do navio **MERCOSUL ITAJAI** (Indicativo de Chamada / Call Sign: **PPKQ**, MMSI: **710027240**):
- **Telemetria Náutica em Tempo Real:** Acompanhamento contínuo de Velocidade no Fundo ($SOG$ em nós), Rumo no Fundo ($COG$ em graus), Proa Verdadeira ($HDG$ em graus giroscópios/verdadeiros), Calado ($Draft$) e coordenadas geodésicas WGS84.
- **Cálculo de Distância Fora da Rota (Cross-Track Distance - XTD / XTE):** Utiliza trigonometria esférica geodésica para calcular a distância ortogonal mínima entre a posição atual do navio e a perna da rota planejada:
  $$d_{xt} = \\arcsin\\left(\\sin(\\delta_{13}) \\cdot \\sin(\\theta_{13} - \\theta_{12})\\right) \\cdot R$$
  Onde $\\delta_{13}$ é a distância angular do início da perna ao navio, $\\theta_{13}$ o azimute ao navio, $\\theta_{12}$ o azimute da perna da rota, e $R$ o raio da Terra em milhas náuticas ($3440.065\\text{ NM}$). O sistema indica desvios para Boreste (Starboard / Positivo) ou Bombordo (Port / Negativo).
- **Corredor de Alerta de Segurança:**
  - 🟢 **Verde (< 0.5 NM):** No centro da derrota planejada.
  - 🟡 **Amarelo (0.5 a 1.0 NM):** Desvio moderado da rota.
  - 🔴 **Alerta Vermelho (> 1.0 NM):** Desvio crítico fora da derrota programada com alerta visual piscante.
- **Vetor Preditor de 6 Minutos:** Projeta graficamente no mapa o deslocamento náutico futuro do navio em 6 minutos ($0.1 \\cdot SOG\\text{ NM}$) ao longo do rumo atual ($COG$).
- **Rastro Histórico (Breadcrumbs):** Registro em tempo real das posições AIS anteriores do navio.
- **Conectividade MarineTraffic:** Permite inserção opcional de chave de API MarineTraffic (PS05) nas configurações do HUD ou operação contínua com simulador cinemático de alta fidelidade ao longo da costa brasileira.

---

## Módulo: Motion Simulator

O Simulador de Movimento (Motion Simulator) analisa zonas de risco e ressonância de estabilidade. Ele gera uma malha topológica polar onde são cruzados os perfis do navio com as especificidades do mar em determinada perna, para avisar sobre fenômenos perigosos.

### 1. Eixo Dinâmico: Encontro Navio / Onda

A interação entre o navio em movimento e o sistema de ondas forma a base de avaliação:
- **Ângulo de Ataque da Onda ($\\mu$):** É calculado a partir da diferença entre o rumo do navio (Heading) e a direção da onda.
  $$\\mu = (Heading - WaveDir + 360) \\pmod{360}$$
- **Comprimento da Onda ($L_w$):** Assumindo ondas em águas profundas ($g = 9.81 m/s^2$):
  $$L_w = \\frac{g \\cdot T_w^2}{2\\pi}$$
- **Período de Encontro ($T_e$):** Intervalo aparente de tempo em que as frentes de onda atingem o casco:
  $$T_e = \\frac{3 \\cdot T_w^2}{3 \\cdot T_w + V \\cdot \\cos(\\mu)}$$

### 2. Diagnóstico de Condições Críticas

Com base em critérios normativos da IMO / IACS (Organização Marítima Internacional), quatro principais fenômenos destrutivos são mapeados:

- **Balanço Sincronizado (Synchronous Roll):** Ocorre quando o período de encontro se iguala ao próprio período de balanço natural do navio ($T_r$).
  $$\\text{Condição: } 0.7 < \\frac{T_r}{T_e} < 1.2$$
- **Balanço Paramétrico (Parametric Roll):** Ocorre em mar de proa ou popa devido às contínuas variações na estabilidade estática.
  $$\\text{Condição: } 1.7 < \\frac{T_r}{T_e} < 2.2$$
- **Ataque por Ondas Altas (High Waves Attack):** Risco de falha estrutural com alagamento.
  $$\\text{Condição: } 130^\\circ < \\mu < 230^\\circ \\;\\text{ e }\\; L_w > 0.8 L_{pp} \\;\\text{ e }\\; H_s > 0.04 L_{pp}$$
- **Surf Riding & Broaching-to:** O navio passa a viajar na mesma velocidade da onda, perdendo controle do leme e podendo ser torcido lateralmente.
  $$\\text{Condição: } 130^\\circ < \\mu < 230^\\circ \\;\\text{ e }\\; \\frac{V}{\\sqrt{L_{pp}}} \\ge 1.8 \\;\\text{ e }\\; H_s \\ge 7.0m$$

### 3. Estimativa de Ângulo Máximo de Balanço

Uma aproximação teórica utilizada na validação de forças laterais e fixação de cargas (Lashing) é dada por:
$$ \\theta_{max} \\approx 0.466 \\cdot \\left( 1.25 - \\frac{0.60}{\\sqrt{GM}} \\right) \\text{ em (radianos)} $$
A tela exibe esse valor para orientar decisões críticas de manobra (Trade-offs) em situações de mares adversos.
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
