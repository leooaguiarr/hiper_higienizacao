// Configuração do app web do Firebase.
//
// Substitua os valores abaixo pelos do SEU projeto. Você os encontra em
// Console do Firebase > Configurações do projeto > Seus aplicativos >
// Configuração do SDK. O passo a passo completo está em docs/FIREBASE_SETUP.md.
//
// Estes valores NÃO são segredo: a chave de API do Firebase Web é pública por
// design e serve apenas para identificar o projeto. Quem protege os dados são
// as regras em firestore.rules e a lista de domínios autorizados no Auth.
//
// Enquanto o project_id for o placeholder, o app roda apenas em modo
// demonstração (dados locais no navegador) e a tela de login fica desativada.

export const firebaseConfig = {
  apiKey: 'AIzaSyCHu0gEkDHA3tso5HSzURFLlcCF-6L6O9g',
  authDomain: 'hiper-higienizacoes.firebaseapp.com',
  projectId: 'hiper-higienizacoes',
  storageBucket: 'hiper-higienizacoes.firebasestorage.app',
  messagingSenderId: '54668400740',
  appId: '1:54668400740:web:48a444d13930e7233ba771'
};

// true quando a configuração ainda não foi preenchida.
export const configPendente = firebaseConfig.projectId === 'SEU-PROJECT-ID';
