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
  apiKey: 'COLE-SUA-API-KEY',
  authDomain: 'SEU-PROJECT-ID.firebaseapp.com',
  projectId: 'SEU-PROJECT-ID',
  storageBucket: 'SEU-PROJECT-ID.firebasestorage.app',
  messagingSenderId: 'COLE-SEU-SENDER-ID',
  appId: 'COLE-SEU-APP-ID'
};

// true quando a configuração ainda não foi preenchida.
export const configPendente = firebaseConfig.projectId === 'SEU-PROJECT-ID';
