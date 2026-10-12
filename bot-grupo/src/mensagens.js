// Linha editorial do grupo: cada post sobe um degrau de consciência do lead
// (vê a prova -> entende o critério -> vê a vantagem -> vê os bastidores -> recebe o convite).
// Tudo com números reais do radar — nada de texto genérico.
const fmt = (n) => Number(n || 0).toLocaleString('pt-BR');
const PAIS = { BR: 'Brasil', US: 'Estados Unidos', MX: 'México', ES: 'Espanha', CO: 'Colômbia', AR: 'Argentina', PT: 'Portugal', GB: 'Reino Unido', CA: 'Canadá', FR: 'França', IT: 'Itália', DE: 'Alemanha', CL: 'Chile', PE: 'Peru', ALL: 'vários países' };
const hoje = () => new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

// ordem da semana (repete): 7 posts por dia
const ROTA = ['relatorio', 'gringa', 'relatorio', 'licao', 'gringa', 'cloaker', 'relatorio', 'gringa', 'bastidores', 'relatorio', 'gringa', 'convite'];

const LICOES = [
  { h: 'Como saber se um anúncio dá lucro sem ver o painel dele', s: 'Três sinais públicos que os grandes usam antes de modelar qualquer oferta.',
    t: (p) => `*COMO SABER SE UM ANÚNCIO DÁ LUCRO — SEM VER O PAINEL DELE*\n\nNinguém te mostra o ROAS. Mas três sinais públicos entregam:\n\n*1. Tempo no ar.* Anúncio no prejuízo é desligado em 3 a 5 dias. Passou de 30, está pagando a conta.\n*2. Criativo duplicado.* O mesmo vídeo em 5, 10, 20 conjuntos = escala horizontal. Só se duplica o que converte.\n*3. Tamanho do anunciante.* 50+ anúncios ativos é operação com verba — e verba só fica onde tem retorno.\n\nNas últimas 24h o robô leu *${fmt(p.lidos)}* anúncios. Só *${fmt(p.lucro)}* passaram nos três sinais (${p.pct}%).\n\nÉ esse filtro que separa oferta de vitrine de oferta que fatura.` },
  { h: 'O criativo duplicado é o print do gerenciador que ninguém posta', s: 'Quando o mesmo vídeo roda em dezenas de conjuntos, o anunciante já validou o ROAS.',
    t: (p) => `*O PRINT DO GERENCIADOR QUE NINGUÉM POSTA*\n\nQuando um gestor acha um criativo vencedor, ele não cria outro: ele *duplica* o mesmo em vários conjuntos e públicos.\n\nNa Biblioteca isso aparece como "X anúncios usam este criativo". É o rastro da escala.\n\nHoje o maior rastro do radar: *${p.top?.page || '—'}*, com o mesmo criativo em *${p.top?.copies || '—'}* anúncios e *${fmt(p.top?.est)}* ativos no total.\n\nVocê não precisa do print do painel deles. O rastro já conta a história.` },
  { h: 'Oferta que escala lá fora chega aqui em semanas', s: 'Quem acompanha EUA e LATAM modela antes de o mercado brasileiro saturar.',
    t: (p) => `*O QUE ESCALA LÁ FORA CHEGA AQUI EM SEMANAS*\n\nBoa parte das ofertas que estouram no Brasil foram validadas antes nos EUA ou no México.\n\nHoje o radar monitora *${p.paises} países*. Nas últimas 24h: *${fmt(p.foraHoje)}* ofertas novas fora do Brasil.\n\nQuem olha só o próprio quintal descobre a oferta quando ela já está saturada.` },
  { h: 'Cloaker não esconde a oferta de quem sabe olhar', s: 'O revisor vê a página branca. O lead real vê a oferta. O radar abre como lead real.',
    t: (p) => `*CLOAKER NÃO ESCONDE A OFERTA DE QUEM SABE OLHAR*\n\nO cloaker mostra uma página "limpa" para o revisor e a oferta real para quem chega pelo anúncio: celular, vindo do Facebook, no país certo.\n\nO robô abre cada página exatamente assim — e registra o destino real, o checkout e o preço.\n\nÉ por isso que os relatórios daqui mostram a *página real*, não a vitrine.` },
  { h: 'Low ticket escala porque o lead decide em segundos', s: 'Ticket baixo + VSL curta + checkout simples: o padrão que mais se repete no radar.',
    t: (p) => `*POR QUE LOW TICKET ESCALA TÃO RÁPIDO*\n\nDecisão de R$ 19 a R$ 47 acontece em segundos. Isso deixa o CPA baixo e o anunciante consegue subir verba sem quebrar o ROAS.\n\nO padrão que mais aparece entre as ofertas com Índice 75+ do radar:\n▸ VSL ou página curta\n▸ checkout direto (Kiwify, Hotmart, Cakto, Payt…)\n▸ order bump e upsell logo depois\n\nNos próximos relatórios, repare no *ticket* e no *checkout* de cada oferta.` },
];

function offerCaption(a, kind, site) {
  const f = a.funnel || {};
  const linhaPag = f.finalUrl ? `\n▸ Página real: ${host(f.finalUrl)}${f.platform ? ' · checkout ' + f.platform : ''}${f.price ? ' · ' + f.price : ''}` : '';
  if (kind === 'gringa') {
    return `*ESCALANDO LÁ FORA* · ${PAIS[a.country] || a.country}\n\n*${a.page}* está com *${fmt(a.ads)} anúncios* ativos. O criativo principal roda em *${a.copies} conjuntos* há *${a.days} dias*.\n\n▸ Nicho: ${a.nicheLabel}\n▸ Índice de Lucro: *${a.profit}/100* (${a.roi})${linhaPag}\n\nO que escala lá fora chega aqui em semanas. Quem modela primeiro, fatura primeiro.`;
  }
  if (kind === 'cloaker') {
    return `*CLOAKER QUEBRADO* · ${hoje()}\n\nAnúncio de *${a.page}* (${fmt(a.ads)} anúncios ativos, ${a.days} dias no ar).\n\nAbrindo como lead real — celular, vindo do Facebook — o destino é:\n▸ *${host(f.finalUrl)}*${f.type ? ' · ' + f.type : ''}\n▸ Checkout: ${f.platform || 'não exposto na página'}${f.price ? '\n▸ Ticket: ' + f.price : ''}\n\nÍndice de Lucro *${a.profit}/100*. A estrutura completa (VSL, mecanismo e oferta) fica no radar.`;
  }
  return `*RELATÓRIO DE OFERTA* · ${hoje()}\n\n*${a.page}* está rodando *${fmt(a.ads)} anúncios* ao mesmo tempo. O criativo principal foi duplicado em *${a.copies} conjuntos* e está no ar há *${a.days} dias*.\n\nAinda não é anunciante gigante — é a janela para modelar *antes* de saturar. Ninguém mantém anúncio no prejuízo por ${a.days} dias.\n\n▸ Nicho: ${a.nicheLabel}\n▸ Índice de Lucro: *${a.profit}/100* (${a.roi})${linhaPag}\n\nOs dados são públicos. O difícil é achar antes de saturar — o radar faz isso sozinho, a cada hora.`;
}

function bastidores(p, site) {
  return {
    card: { h: 'O radar desta semana', s: `${fmt(p.semana)} ofertas novas · ${fmt(p.lucroSemana)} com Índice de Lucro 75+ · ${p.paises} países monitorados.`, k: 'BASTIDORES' },
    text: `*BASTIDORES DO RADAR* · semana\n\n▸ *${fmt(p.semana)}* ofertas novas mineradas\n▸ *${fmt(p.lucroSemana)}* com Índice de Lucro 75+\n▸ Nicho mais quente: *${p.topNicho || '—'}*\n▸ Países: ${p.paisesLista || '—'}\n\nO que vai para o grupo é uma fração. O radar completo, com filtro por nicho, país, ticket e tipo de produto, fica no app.\n\nDemonstração ao vivo, sem cadastro: ${site}/demo/`,
  };
}
function convite(site) {
  return {
    card: { h: 'Tenha o seu próprio radar de ofertas', s: 'Robôs 24h na Biblioteca da Meta e no TikTok · VSL baixada e transcrita · mecanismo destrinchado · cloaker quebrado.', k: 'ACESSO ORACLE ADS' },
    text: `*TUDO O QUE APARECE AQUI SAI DO ORACLE ADS*\n\nNo app, o radar é seu — programado para o seu nicho e os seus países:\n\n▸ Robôs minerando a cada 2h (Meta + TikTok, 40 países)\n▸ Índice de Lucro e faixas de escala (50+, 10–49, até 9 anúncios)\n▸ Página real atrás do cloaker, checkout e ticket\n▸ VSL baixada em MP4, transcrita e com o mecanismo destrinchado\n▸ Cérebro que aprende o que você procura\n\nAcesso liberado na hora · garantia de 7 dias.\n\n${site}`,
  };
}

module.exports = { ROTA, LICOES, offerCaption, bastidores, convite };
