import { firebaseConfig } from './firebase-config.js';
import { maskPhone, maskCep, maskCpfCnpj } from './utils.js';

const SDK = 'https://www.gstatic.com/firebasejs/12.9.0';

function showError(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = 'toast show error';
  setTimeout(() => toast.className = 'toast', 4000);
}

document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const adminUid = urlParams.get('u');
  
  const form = document.getElementById('cadastroForm');
  
  if (!adminUid) {
    showError("Link de cadastro inválido. Falta a identificação do sistema.");
    form.style.display = 'none';
    return;
  }

  // Bind events immediately (UI does not depend on Firebase)
  const zipInput = document.getElementById('clientZip');
  const btnSearchZip = document.getElementById('btnSearchZip');
  const phoneInput = document.getElementById('clientPhone');
  const docInput = document.getElementById('clientDoc');
  
  if (docInput) {
    docInput.addEventListener('input', e => {
      e.target.value = maskCpfCnpj(e.target.value);
    });
  }
  
  phoneInput.addEventListener('input', e => {
    e.target.value = maskPhone(e.target.value);
  });
  
  zipInput.addEventListener('input', e => {
    e.target.value = maskCep(e.target.value);
  });

  zipInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      btnSearchZip.click();
    }
  });

  document.getElementById('clientNumber').addEventListener('input', e => {
    e.target.value = e.target.value.replace(/\D/g, '');
  });

  const textFields = ['clientFirstName', 'clientLastName', 'clientCity'];
  textFields.forEach(id => {
    document.getElementById(id).addEventListener('input', e => {
      e.target.value = e.target.value.replace(/[0-9]/g, '');
    });
  });
  
  btnSearchZip.addEventListener('click', async () => {
    const cep = zipInput.value.replace(/\D/g, '');
    if (cep.length !== 8) {
      showError("CEP deve ter 8 dígitos");
      return;
    }
    
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json();
      if (data && !data.erro) {
        document.getElementById('clientStreet').value = data.logradouro || '';
        document.getElementById('clientNeighborhood').value = data.bairro || '';
        document.getElementById('clientCity').value = data.localidade || '';
        document.getElementById('clientNumber').focus();
      } else {
        showError("CEP não encontrado");
      }
    } catch(e) {
      console.warn("Erro ao buscar CEP", e);
      showError("Erro na busca de CEP");
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    document.getElementById('loadingOverlay').style.display = 'flex';
    
    try {
      // Lazy load Firebase ONLY on submit
      const { initializeApp } = await import(`${SDK}/firebase-app.js`);
      const { getFirestore, collection, addDoc, serverTimestamp } = await import(`${SDK}/firebase-firestore.js`);

      const app = initializeApp(firebaseConfig);
      const db = getFirestore(app);

      const clientData = {
        firstName: document.getElementById('clientFirstName').value.trim(),
        lastName: document.getElementById('clientLastName').value.trim(),
        phone: document.getElementById('clientPhone').value.trim(),
        document: docInput ? docInput.value.trim() : '',
        zip: document.getElementById('clientZip').value.trim(),
        street: document.getElementById('clientStreet').value.trim(),
        number: document.getElementById('clientNumber').value.trim(),
        complement: document.getElementById('clientComplement').value.trim(),
        neighborhood: document.getElementById('clientNeighborhood').value.trim(),
        city: document.getElementById('clientCity').value.trim(),
        createdAt: serverTimestamp()
      };
      
      await addDoc(collection(db, 'usuarios', adminUid, 'clientes'), clientData);
      
      form.style.display = 'none';
      document.getElementById('brandHeader').style.display = 'none';
      document.getElementById('successMessage').style.display = 'block';
      
    } catch (err) {
      console.error("Erro ao salvar cadastro:", err);
      showError("Não foi possível enviar seu cadastro. Verifique sua conexão.");
    } finally {
      document.getElementById('loadingOverlay').style.display = 'none';
    }
  });
});
