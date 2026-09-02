// Dados demonstrativos e catálogo padrão de serviços.
//
// SERVICOS_PADRAO também é usado no primeiro acesso de uma conta nova na
// nuvem, para que a agenda já nasça com o catálogo da Hiper cadastrado.

import { localISO, addDays } from './utils.js';

export const SERVICOS_PADRAO = [
{ id:'svc-sofa', name:'Higienização de sofá', icon:'sofa', duration:180, basePrice:280, active:true, description:'Limpeza profunda, remoção de ácaros, odores e sujeiras sem agredir o tecido.' },
{ id:'svc-chair', name:'Higienização de cadeiras', icon:'chair', duration:120, basePrice:160, active:true, description:'Tratamento para conjuntos residenciais e corporativos, com recuperação de cor e toque.' },
{ id:'svc-mattress', name:'Higienização de colchão', icon:'mattress', duration:120, basePrice:220, active:true, description:'Redução de ácaros, manchas e odores para um ambiente de descanso mais saudável.' },
{ id:'svc-rug', name:'Tapetes e carpetes', icon:'rug', duration:180, basePrice:190, active:true, description:'Processo adequado à fibra para remover sujeira incrustada e preservar a maciez.' },
{ id:'svc-protection', name:'Hiper Proteção Premium', icon:'shield', duration:150, basePrice:350, active:true, description:'Impermeabilização que dificulta a absorção de líquidos sem alterar cor ou textura.' },
{ id:'svc-pet', name:'Remoção de urina de pet', icon:'pet', duration:150, basePrice:250, active:true, description:'Tratamento técnico de manchas e odores de origem orgânica, seguro para o estofado.' },
{ id:'svc-kids', name:"Higienização infantil", icon:'baby', duration:90, basePrice:140, active:true, description:'Carrinhos, cadeirinhas e itens infantis com produtos seguros e hipoalergênicos.' },
{ id:'svc-business', name:'Atendimento empresarial', icon:'business', duration:240, basePrice:520, active:true, description:'Soluções planejadas para escritórios, clínicas, condomínios e alto volume.' }
];

export function seedData() {
  const today = new Date();
  const d = offset => localISO(addDays(today, offset));
  const monthDate = (months, day) => localISO(new Date(today.getFullYear(), today.getMonth() + months, day));
  const services = SERVICOS_PADRAO.map(service => ({ ...service }));
  const clients = [
    { id:'cli-ana', firstName:'Ana', lastName:'Martins', phone:'(16) 99142-3058', address:'Rua das Acácias, 182', neighborhood:'Jardim Botânico', city:'Ribeirão Preto', birthDate:'1988-04-18', nextRecommendation:d(5), notes:'Tem dois gatos. Avisar 30 min antes.' },
    { id:'cli-carlos', firstName:'Carlos', lastName:'Menezes', phone:'(16) 99774-1180', address:'Av. Portugal, 940', neighborhood:'Jardim São Luiz', city:'Ribeirão Preto', birthDate:'1979-10-02', nextRecommendation:d(-7), notes:'Portaria exige identificação.' },
    { id:'cli-beatriz', firstName:'Beatriz', lastName:'Almeida', phone:'(16) 98834-7201', address:'Rua Chile, 61', neighborhood:'Vila Seixas', city:'Ribeirão Preto', birthDate:'1992-01-27', nextRecommendation:monthDate(4,15), notes:'' },
    { id:'cli-clinica', firstName:'Clínica', lastName:'Vitta', phone:'(16) 3234-9901', address:'Av. Nove de Julho, 1550', neighborhood:'Centro', city:'Ribeirão Preto', birthDate:'', nextRecommendation:d(18), notes:'Atender após o expediente.' },
    { id:'cli-marcos', firstName:'Marcos', lastName:'Ferreira', phone:'(16) 99210-4482', address:'Rua Garibaldi, 715', neighborhood:'Alto da Boa Vista', city:'Ribeirão Preto', birthDate:'1985-07-12', nextRecommendation:d(-2), notes:'Cachorro de grande porte.' }
  ];
  const appointments = [
    { id:'apt-1', clientId:'cli-ana', serviceId:'svc-sofa', date:d(0), time:'08:30', duration:180, value:320, status:'confirmed', paymentStatus:'pending', paymentMethod:'PIX', address:'Rua das Acácias, 182 - Jardim Botânico', team:'Equipe Rafael', notes:'Sofá retrátil de 4 lugares, tecido bege.' },
    { id:'apt-2', clientId:'cli-clinica', serviceId:'svc-chair', date:d(0), time:'13:30', duration:180, value:480, status:'scheduled', paymentStatus:'pending', paymentMethod:'Transferência', address:'Av. Nove de Julho, 1550 - Centro', team:'Equipe Rafael e Caio', notes:'12 cadeiras da recepção.' },
    { id:'apt-3', clientId:'cli-beatriz', serviceId:'svc-mattress', date:d(1), time:'09:00', duration:120, value:240, status:'confirmed', paymentStatus:'paid', paymentMethod:'Cartão', address:'Rua Chile, 61 - Vila Seixas', team:'Equipe Caio', notes:'Colchão queen.' },
    { id:'apt-4', clientId:'cli-marcos', serviceId:'svc-pet', date:d(2), time:'14:00', duration:150, value:290, status:'scheduled', paymentStatus:'pending', paymentMethod:'PIX', address:'Rua Garibaldi, 715 - Alto da Boa Vista', team:'Equipe Rafael', notes:'Urina no assento esquerdo.' },
    { id:'apt-5', clientId:'cli-carlos', serviceId:'svc-protection', date:d(-1), time:'10:00', duration:180, value:420, status:'completed', paymentStatus:'paid', paymentMethod:'PIX', address:'Av. Portugal, 940 - Jardim São Luiz', team:'Equipe Rafael', notes:'Impermeabilização após higienização.' },
    { id:'apt-6', clientId:'cli-ana', serviceId:'svc-kids', date:d(-25), time:'14:30', duration:90, value:150, status:'completed', paymentStatus:'paid', paymentMethod:'Dinheiro', address:'Rua das Acácias, 182 - Jardim Botânico', team:'Equipe Caio', notes:'Carrinho e bebê conforto.' },
    { id:'apt-7', clientId:'cli-beatriz', serviceId:'svc-rug', date:monthDate(-2,12), time:'09:00', duration:180, value:230, status:'completed', paymentStatus:'paid', paymentMethod:'PIX', address:'Rua Chile, 61 - Vila Seixas', team:'Equipe Rafael', notes:'' },
    { id:'apt-8', clientId:'cli-carlos', serviceId:'svc-sofa', date:monthDate(-4,8), time:'08:30', duration:180, value:300, status:'completed', paymentStatus:'paid', paymentMethod:'Cartão', address:'Av. Portugal, 940 - Jardim São Luiz', team:'Equipe Rafael', notes:'' }
  ];
  const transactions = [
    { id:'tx-1', appointmentId:'apt-5', type:'income', date:d(-1), description:'Hiper Proteção Premium - Carlos Menezes', value:420, paymentMethod:'PIX', status:'paid', category:'Serviços' },
    { id:'tx-2', appointmentId:'apt-6', type:'income', date:d(-25), description:"Higienização infantil - Ana Martins", value:150, paymentMethod:'Dinheiro', status:'paid', category:'Serviços' },
    { id:'tx-3', type:'expense', date:d(-3), description:'Combustível das equipes', value:180, paymentMethod:'Cartão', status:'paid', category:'Deslocamento' },
    { id:'tx-4', type:'expense', date:d(-12), description:'Produtos de extração', value:265, paymentMethod:'PIX', status:'paid', category:'Insumos' },
    { id:'tx-5', appointmentId:'apt-7', type:'income', date:monthDate(-2,12), description:'Tapetes e carpetes - Beatriz Almeida', value:230, paymentMethod:'PIX', status:'paid', category:'Serviços' },
    { id:'tx-6', appointmentId:'apt-8', type:'income', date:monthDate(-4,8), description:'Higienização de sofá - Carlos Menezes', value:300, paymentMethod:'Cartão', status:'paid', category:'Serviços' },
    { id:'tx-7', type:'income', date:monthDate(-1,16), description:'Atendimento empresarial - Espaço Alfa', value:780, paymentMethod:'Transferência', status:'paid', category:'Serviços' },
    { id:'tx-8', type:'expense', date:monthDate(-1,18), description:'Manutenção da extratora', value:210, paymentMethod:'PIX', status:'paid', category:'Equipamentos' },
    { id:'tx-9', type:'income', date:monthDate(-3,10), description:'Higienizações residenciais', value:1240, paymentMethod:'PIX', status:'paid', category:'Serviços' },
    { id:'tx-10', type:'income', date:monthDate(-5,20), description:'Serviços do período', value:980, paymentMethod:'Misto', status:'paid', category:'Serviços' }
  ];
  return { services, clients, appointments, transactions };
}
