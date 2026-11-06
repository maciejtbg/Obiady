// ============================================
// GENERATOR DEKLARACJI OBIADOWEJ - UPROSZCZONY
// Bez zbędnych modali, prostsza nawigacja
// ============================================

// Strona sprzed 06.11.2026 bywa jeszcze w pamięci przeglądarek (hosting kazał ją
// trzymać 30 dni) i ładuje ten skrypt bez numeru wersji (?v=). Wtedy prosimy serwer
// o wyczyszczenie pamięci podręcznej (get_history.php bez v, patrz Clear-Site-Data)
// i raz przeładowujemy stronę, żeby przeglądarka pobrała aktualny index.html.
(function reloadOutdatedPage() {
  const src = document.currentScript ? document.currentScript.src : '';
  if (!src || /[?&]v=/.test(src)) return;
  try {
    if (sessionStorage.getItem('obiady_reloaded_for_update')) return;
    sessionStorage.setItem('obiady_reloaded_for_update', '1');
  } catch (e) {
    return;
  }
  fetch('get_history.php?limit=1', { cache: 'no-store' }).catch(() => {}).finally(() => location.reload());
})();

// Aktualna strona pyta o historię z parametrem v, stara bez niego (get_history.php)
const HISTORY_API_VERSION = 2;

// ============================================
// CZĘŚĆ 1: ZMIENNE GLOBALNE I ELEMENTY DOM
// ============================================

const devMenuToggle = document.getElementById('devMenuToggle');
const devMenu = document.getElementById('devMenu');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const themeIcon = document.getElementById('themeIcon');
const toggleTextareaCheckbox = document.getElementById('toggleTextarea');
const convertedTextarea = document.getElementById('convertedText');
const convertButton = document.getElementById('convertBtn');
const toggleDebugCheckbox = document.getElementById('toggleDebug');
const debugBox = document.getElementById('debugBox');
const summaryBox = document.getElementById('summaryBox');
const generateMenuBtn = document.getElementById('generateMenuBtn');
const fileInput = document.getElementById('fileInput');
const loadingSpinner = document.getElementById('loadingSpinner');
const generateDeclarationBtn = document.getElementById('generateDeclarationBtn');
const historySection = document.getElementById('historySection');
const historyList = document.getElementById('historyList');
const expandHistoryBtn = document.getElementById('expandHistoryBtn');

let historyData = [];
let historyExpanded = false;

// Zmienne dla podpisu
let signatureCanvas = null;
let signatureCtx = null;
let isDrawing = false;
// LocalStorage keys
const STORAGE_KEYS = {
  childName: 'meal_declaration_child_name',
  childClass: 'meal_declaration_child_class',
  healthNotes: 'meal_declaration_health_notes',
  signature: 'meal_declaration_signature',
  selectionsPrefix: 'meal_selections_' // + MIESIAC_ROK, np. meal_selections_MAJ_2026
};

// -------------------------------------------------------
// Biblioteki ładowane dopiero wtedy, gdy są potrzebne
// -------------------------------------------------------
// jsPDF, html2canvas i czcionki (sam fonts.js waży ok. 1,7 MB) są potrzebne
// tylko do PDF, a Tippy tylko do dymków na komputerze. Dzięki temu strona
// na telefonie startuje dużo szybciej.

const LAZY_SCRIPTS = {
  jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  html2canvas: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  fonts: 'fonts.js',
  popper: 'https://unpkg.com/@popperjs/core@2',
  tippy: 'https://unpkg.com/tippy.js@6'
};
const loadedScripts = {};

function loadScriptOnce(src) {
  if (!loadedScripts[src]) {
    loadedScripts[src] = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => {
        delete loadedScripts[src];
        reject(new Error('Nie udało się załadować ' + src));
      };
      document.head.appendChild(script);
    });
  }
  return loadedScripts[src];
}

function loadPdfLibraries() {
  return Promise.all([loadScriptOnce(LAZY_SCRIPTS.jspdf), loadScriptOnce(LAZY_SCRIPTS.fonts)]);
}

async function loadTooltipLibraries() {
  await loadScriptOnce(LAZY_SCRIPTS.popper);
  await loadScriptOnce(LAZY_SCRIPTS.tippy);
}

// -------------------------------------------------------
// Zapis / odczyt wyborów dań (checkboxy) per miesiąc
// -------------------------------------------------------

function getSelectionsKey(monthYear) {
  // monthYear np. "MAJ 2026" → klucz "meal_selections_MAJ_2026"
  return STORAGE_KEYS.selectionsPrefix + (monthYear || 'unknown').replace(/\s+/g, '_');
}

function saveSelections() {
  // Zbierz stan wszystkich wierszy z tabeli
  const rows = document.querySelectorAll('#menuTable tbody tr');
  if (!rows.length) return;

  const selections = {};
  rows.forEach(row => {
    if (row.classList.contains('table-secondary')) return; // weekend/święto
    const dateCell = row.cells[1]; // kolumna z datą np. "05.05"
    const checkboxes = row.querySelectorAll('input[type="checkbox"]');
    if (!dateCell || checkboxes.length < 2) return;
    const dateKey = dateCell.textContent.trim();
    selections[dateKey] = {
      first: checkboxes[0].checked,
      second: checkboxes[1].checked
    };
  });

  const monthYear = getMonthYear();
  const storageKey = getSelectionsKey(monthYear);
  localStorage.setItem(storageKey, JSON.stringify(selections));
}

function loadSelections(monthYear) {
  const storageKey = getSelectionsKey(monthYear);
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function applySelections(savedSelections) {
  if (!savedSelections) return;
  const rows = document.querySelectorAll('#menuTable tbody tr');
  rows.forEach(row => {
    if (row.classList.contains('table-secondary')) return;
    const dateCell = row.cells[1];
    const checkboxes = row.querySelectorAll('input[type="checkbox"]');
    if (!dateCell || checkboxes.length < 2) return;
    const dateKey = dateCell.textContent.trim();
    if (savedSelections[dateKey] !== undefined) {
      const sel = savedSelections[dateKey];
      // Pierwsze danie
      checkboxes[0].checked = sel.first;
      checkboxes[0].dispatchEvent(new Event('change'));
      // Drugie danie
      checkboxes[1].checked = sel.second;
      checkboxes[1].dispatchEvent(new Event('change'));
    }
  });
}
// Funkcje do zarządzania localStorage
function loadSavedData() {
  const childName = localStorage.getItem(STORAGE_KEYS.childName) || '';
  const childClass = localStorage.getItem(STORAGE_KEYS.childClass) || '';
  const healthNotes = localStorage.getItem(STORAGE_KEYS.healthNotes) || 'brak';
  
  // Wypełnij pola EMAIL
  if (document.getElementById('childName')) {
    document.getElementById('childName').value = childName;
  }
  if (document.getElementById('childClass')) {
    document.getElementById('childClass').value = childClass;
  }
  if (document.getElementById('healthNotes')) {
    document.getElementById('healthNotes').value = healthNotes;
  }
  
  // Wypełnij pola PDF
  if (document.getElementById('childNamePDF')) {
    document.getElementById('childNamePDF').value = childName;
  }
  if (document.getElementById('childClassPDF')) {
    document.getElementById('childClassPDF').value = childClass;
  }
  if (document.getElementById('healthNotesPDF')) {
    document.getElementById('healthNotesPDF').value = healthNotes;
  }
  
  // Załaduj podpis jeśli istnieje
  const savedSignature = localStorage.getItem(STORAGE_KEYS.signature);
  if (savedSignature && signatureCanvas && signatureCtx) {
    const img = new Image();
    img.onload = function() {
      signatureCtx.drawImage(img, 0, 0);
    };
    img.src = savedSignature;
  }
}

function saveData() {
  // Pobierz dane z formularza EMAIL (priorytet)
  let childName = document.getElementById('childName')?.value || '';
  let childClass = document.getElementById('childClass')?.value || '';
  let healthNotes = document.getElementById('healthNotes')?.value || 'brak';
  
  // Jeśli puste, sprawdź formularz PDF
  if (!childName) childName = document.getElementById('childNamePDF')?.value || '';
  if (!childClass) childClass = document.getElementById('childClassPDF')?.value || '';
  if (!healthNotes || healthNotes === 'brak') {
    healthNotes = document.getElementById('healthNotesPDF')?.value || 'brak';
  }
  
  // Zapisz do localStorage
  localStorage.setItem(STORAGE_KEYS.childName, childName);
  localStorage.setItem(STORAGE_KEYS.childClass, childClass);
  localStorage.setItem(STORAGE_KEYS.healthNotes, healthNotes);
}

function syncFormData(sourceForm) {
  if (sourceForm === 'email') {
    // Skopiuj z EMAIL do PDF
    const childName = document.getElementById('childName')?.value || '';
    const childClass = document.getElementById('childClass')?.value || '';
    const healthNotes = document.getElementById('healthNotes')?.value || 'brak';
    
    if (document.getElementById('childNamePDF')) {
      document.getElementById('childNamePDF').value = childName;
    }
    if (document.getElementById('childClassPDF')) {
      document.getElementById('childClassPDF').value = childClass;
    }
    if (document.getElementById('healthNotesPDF')) {
      document.getElementById('healthNotesPDF').value = healthNotes;
    }
  } else if (sourceForm === 'pdf') {
    // Skopiuj z PDF do EMAIL
    const childName = document.getElementById('childNamePDF')?.value || '';
    const childClass = document.getElementById('childClassPDF')?.value || '';
    const healthNotes = document.getElementById('healthNotesPDF')?.value || 'brak';
    
    if (document.getElementById('childName')) {
      document.getElementById('childName').value = childName;
    }
    if (document.getElementById('childClass')) {
      document.getElementById('childClass').value = childClass;
    }
    if (document.getElementById('healthNotes')) {
      document.getElementById('healthNotes').value = healthNotes;
    }
  }
  
  saveData();
}
// Dodaj event listenery do pól formularza
function attachFormListeners() {
  // Pola EMAIL
  ['childName', 'childClass', 'healthNotes'].forEach(id => {
    const field = document.getElementById(id);
    if (field) {
      field.addEventListener('input', () => {
        syncFormData('email');
      });
    }
  });
  
  // Pola PDF
  ['childNamePDF', 'childClassPDF', 'healthNotesPDF'].forEach(id => {
    const field = document.getElementById(id);
    if (field) {
      field.addEventListener('input', () => {
        syncFormData('pdf');
      });
    }
  });
}
// ============================================
// CZĘŚĆ 2: INICJALIZACJA UI
// ============================================

// Menu deweloperskie
devMenuToggle.addEventListener('click', () => {
  devMenu.classList.toggle('d-none');
});

// Motyw ciemny/jasny
function applyTheme(theme) {
  if (theme === 'dark') {
    document.body.classList.add('dark-theme');
    themeIcon.textContent = '🌙';
  } else {
    document.body.classList.remove('dark-theme');
    themeIcon.textContent = '☀️';
  }
}

themeToggleBtn.addEventListener('click', () => {
  const isDark = document.body.classList.contains('dark-theme');
  const newTheme = isDark ? 'light' : 'dark';
  applyTheme(newTheme);
  localStorage.setItem('theme', newTheme);
});

// Bez zapisanego wyboru bierzemy motyw z ustawień telefonu/komputera
const savedTheme = localStorage.getItem('theme') ||
  (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
applyTheme(savedTheme);

// Obsługa widoczności
toggleTextareaCheckbox.addEventListener('change', function () {
  convertedTextarea.classList.toggle('d-none', !this.checked);
  convertButton.classList.toggle('d-none', !this.checked);
});

toggleDebugCheckbox.addEventListener('change', function () {
  debugBox.classList.toggle('d-none', !this.checked);
});

// ============================================
// CZĘŚĆ 3: OBSŁUGA HISTORII - LAZY LOADING
// ============================================

let allHistoryLoaded = false;
let autoOpenPending = true; // przy wejściu na stronę otwieramy najnowszy jadłospis z listy

function loadHistory() {
  fetch(`get_history.php?limit=1&v=${HISTORY_API_VERSION}`)
    .then(response => {
      if (!response.ok) {
        throw new Error('HTTP ' + response.status);
      }
      return response.json();
    })
    .then(data => {
      if (data.success && data.history && data.history.length > 0) {
        historyData = data.history;
        allHistoryLoaded = false;
        renderHistory();
        autoOpenNewestMenu();
      } else {
        autoOpenPending = false;
        historySection.classList.add('d-none');
        if (toggleDebugCheckbox.checked && data.error) {
          debugBox.innerHTML = '⚠️ Historia: ' + data.error;
          debugBox.classList.remove('d-none');
        }
      }
    })
    .catch(error => {
      autoOpenPending = false;
      historySection.classList.add('d-none');
      if (toggleDebugCheckbox.checked) {
        console.warn('Historia niedostępna:', error);
      }
    });
}

function loadMoreHistory() {
  expandHistoryBtn.disabled = true;
  expandHistoryBtn.textContent = 'Ładowanie...';
  
  fetch(`get_history.php?limit=20&v=${HISTORY_API_VERSION}`)
    .then(response => {
      if (!response.ok) {
        throw new Error('HTTP ' + response.status);
      }
      return response.json();
    })
    .then(data => {
      if (data.success && data.history) {
        historyData = data.history;
        allHistoryLoaded = true;
        renderHistory();
      } else {
        alert('❌ Błąd ładowania historii: ' + (data.error || 'Nieznany błąd'));
        expandHistoryBtn.textContent = 'Pokaż starsze jadłospisy';
        expandHistoryBtn.disabled = false;
      }
    })
    .catch(error => {
      console.error('Błąd ładowania historii:', error);
      alert('❌ Nie udało się załadować historii');
      expandHistoryBtn.textContent = 'Pokaż starsze jadłospisy';
      expandHistoryBtn.disabled = false;
    });
}

// Nazwa miesiąca jadłospisu z historii: z wyniku parsera (Month, Year), a dla
// starszych wpisów z nazwy pliku ("MENU_KATOLIK_Grudzień_2025.doc", "MENU_03.2026.doc")
const HISTORY_MONTH_STEMS = ['stycz', 'lut', 'mar', 'kwie', 'maj', 'czerw', 'lip', 'sierp', 'wrze', 'pazdz', 'listop', 'grud'];

function historyMenuLabel(item) {
  try {
    const parsed = JSON.parse(item.converted_text);
    if (parsed && parsed.Month && parsed.Year) return `${DECLARATION_MONTHS[parsed.Month]} ${parsed.Year}`;
  } catch (e) {}
  const name = String(item.filename).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
  const year = (name.match(/20\d\d/) || [''])[0];
  let month = HISTORY_MONTH_STEMS.findIndex(stem => name.includes(stem)) + 1;
  if (!month) {
    const numeric = name.match(/(?:^|[^\d])(0?[1-9]|1[0-2])[._-]20\d\d/);
    if (numeric) month = Number(numeric[1]);
  }
  return month ? `${DECLARATION_MONTHS[month]} ${year}`.trim() : null;
}

function renderHistory() {
  if (historyData.length === 0) {
    historySection.classList.add('d-none');
    return;
  }

  historySection.classList.remove('d-none');

  historyList.innerHTML = historyData.map((item, index) => {
    const label = historyMenuLabel(item);
    const filename = escapeHtml(item.filename);
    // Jadłospis, który jest teraz w tabeli (z listy albo właśnie wgrany)
    const isOpen = currentMenuSource !== null && item.converted_text === currentMenuSource;
    return `
      <button type="button" class="history-item${index === 0 ? ' is-latest' : ''}${isOpen ? ' is-open' : ''}" onclick="loadFromHistory(${Number(item.id)})">
        <span class="history-item-main">
          <strong>${label ? escapeHtml(label) : filename}</strong>
          ${index === 0 ? '<span class="history-badge">Najnowszy</span>' : ''}
          ${isOpen ? '<span class="history-badge is-open-badge">Otwarty</span>' : ''}
        </span>
        <small>${label ? filename + ' · ' : ''}wczytany ${escapeHtml(item.upload_date)}</small>
      </button>
    `;
  }).join('');

  if (!allHistoryLoaded && historyData.length === 1) {
    expandHistoryBtn.classList.remove('d-none');
    expandHistoryBtn.textContent = 'Pokaż starsze jadłospisy';
    expandHistoryBtn.disabled = false;
  } else if (allHistoryLoaded && historyData.length > 1) {
    expandHistoryBtn.classList.remove('d-none');
    expandHistoryBtn.textContent = 'Pokaż tylko najnowszy';
    expandHistoryBtn.disabled = false;
  } else {
    expandHistoryBtn.classList.add('d-none');
  }
}

expandHistoryBtn.addEventListener('click', () => {
  if (!allHistoryLoaded) {
    loadMoreHistory();
  } else {
    allHistoryLoaded = false;
    loadHistory();
  }
});

window.loadFromHistory = function(id) {
  const item = historyData.find(h => h.id === id);
  if (item) openHistoryItem(item, true);
};

function openHistoryItem(item, scroll) {
  if (toggleDebugCheckbox.checked) {
    debugBox.innerHTML = `📂 Wczytano z historii: ${escapeHtml(item.filename)}<br>ID: ${Number(item.id)}`;
    debugBox.classList.remove('d-none');
  }
  convertedTextarea.value = item.converted_text;
  parseMenu(item.converted_text);
  // Na telefonie tabela jest niżej: po kliknięciu przewijamy do niej od razu
  if (scroll) document.querySelector('.area-menu')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Przy wejściu na stronę tabela od razu pokazuje najnowszy jadłospis (bez przewijania),
// chyba że rodzic zdążył już coś otworzyć albo wybrał plik
function autoOpenNewestMenu() {
  if (!autoOpenPending) return;
  autoOpenPending = false;
  const busy = fileInput.files.length > 0 || !loadingSpinner.classList.contains('d-none');
  if (busy || document.querySelector('#menuTable tbody tr') || !historyData[0]) return;
  openHistoryItem(historyData[0], false);
}

// Pozycja listy po id; gdy nie ma jej wśród pokazanych, pobieramy dłuższą listę
async function findHistoryItem(id) {
  let item = historyData.find(h => h.id === id);
  if (item) return item;
  try {
    const data = await (await fetch(`get_history.php?limit=50&v=${HISTORY_API_VERSION}`)).json();
    item = (data.history || []).find(h => h.id === id);
  } catch (error) {
    console.warn('Lista jadłospisów niedostępna:', error);
  }
  return item || null;
}

// ============================================
// CZĘŚĆ 4: KONWERSJA PLIKÓW
// ============================================

convertButton.addEventListener('click', convertFileAndGenerateMenu);
generateMenuBtn.addEventListener('click', () => {
  if (!toggleTextareaCheckbox.checked) {
    convertFileAndGenerateMenu();
  } else {
    const text = convertedTextarea.value;
    if (!text) {
      if (toggleDebugCheckbox.checked) {
        debugBox.textContent = "Brak przekonwertowanego tekstu do przetworzenia.";
      }
      return;
    }
    loadingSpinner.classList.remove('d-none');
    setTimeout(() => {
      parseMenu(text);
      loadingSpinner.classList.add('d-none');
    }, 100);
  }
});

// Po wybraniu pliku menu wczytuje się od razu, bez dodatkowego kliknięcia
fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  const title = document.getElementById('dropzoneTitle');
  if (title) title.textContent = file ? file.name : 'Wybierz plik z jadłospisem';
  if (file && !toggleTextareaCheckbox.checked) {
    convertFileAndGenerateMenu();
  }
});

// Przeciąganie pliku na pole wyboru (komputer)
const dropzone = document.getElementById('dropzone');
if (dropzone) {
  ['dragenter', 'dragover'].forEach(type => dropzone.addEventListener(type, e => {
    e.preventDefault();
    dropzone.classList.add('is-dragover');
  }));
  ['dragleave', 'drop'].forEach(type => dropzone.addEventListener(type, () => {
    dropzone.classList.remove('is-dragover');
  }));
  dropzone.addEventListener('drop', e => {
    e.preventDefault();
    if (!e.dataTransfer.files.length) return;
    fileInput.files = e.dataTransfer.files;
    fileInput.dispatchEvent(new Event('change'));
  });
}

function convertFileAndGenerateMenu() {
  const file = fileInput.files[0];
  if (!file) {
    if (toggleDebugCheckbox.checked) {
      debugBox.textContent = "Nie wybrano pliku do przesłania.";
      debugBox.classList.remove('d-none');
    }
    return;
  }
  
  checkFileExists(file.name).then(exists => {
    if (exists) {
      showDuplicateModal(exists, () => {
        uploadAndConvert(file);
      });
    } else {
      uploadAndConvert(file);
    }
  });
}

function checkFileExists(filename) {
  return fetch('check_file.php?filename=' + encodeURIComponent(filename))
    .then(response => response.json())
    .then(data => {
      if (data.exists) {
        return data.file;
      }
      return null;
    })
    .catch(error => {
      console.error('Błąd sprawdzania pliku:', error);
      return null;
    });
}

// Ten sam plik jest już na wspólnej liście: proponujemy otwarcie zapisanego wyniku
// (bez ponownego przetwarzania i zużywania limitów usług)
function showDuplicateModal(fileData, onConfirm) {
  const raw = String(fileData.upload_date || '');
  const when = getTimeAgo(raw);
  const date = raw.match(/^(\d{4})-(\d\d)-(\d\d)/);
  const whenText = when === raw && date ? `${date[3]}.${date[2]}.${date[1]}` : when;
  openAppDialog('duplicateModal', `
    <h3 class="app-dialog-title">Ten jadłospis jest już na liście</h3>
    <p>Plik <strong>${escapeHtml(fileData.filename)}</strong> był już wczytany (${escapeHtml(whenText)}). Możesz go otworzyć od razu, bez ponownego przetwarzania.</p>
    <div class="app-dialog-actions">
      <button type="button" class="btn btn-primary" data-action="open">Otwórz zapisany</button>
      <button type="button" class="btn btn-soft" data-action="upload">Wgraj mimo to</button>
      <button type="button" class="btn btn-link-muted" data-action="close">Anuluj</button>
    </div>`, async action => {
    if (action === 'upload') onConfirm();
    if (action === 'open') {
      const item = await findHistoryItem(Number(fileData.id));
      if (item) openHistoryItem(item, true);
      else onConfirm();
    }
  }, { label: 'Jadłospis jest już na liście' });
}

// Odmiana liczebników: 1 minuta, 2 minuty, 5 minut
function polishPlural(count, one, few, many) {
  if (count === 1) return one;
  const last = count % 10;
  const lastTwo = count % 100;
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? few : many;
}

function getTimeAgo(dateString) {
  const diffMs = Date.now() - new Date(dateString.replace(' ', 'T')).getTime();
  if (!isFinite(diffMs)) return dateString;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'przed chwilą';
  if (diffMins < 60) return `${diffMins} ${polishPlural(diffMins, 'minutę', 'minuty', 'minut')} temu`;
  if (diffHours < 24) return `${diffHours} ${polishPlural(diffHours, 'godzinę', 'godziny', 'godzin')} temu`;
  if (diffDays === 1) return 'wczoraj';
  if (diffDays < 30) return `${diffDays} dni temu`;
  return dateString;
}

function uploadAndConvert(file) {
  const formData = new FormData();
  formData.append('file', file);
  loadingSpinner.classList.remove('d-none');
  
  if (toggleDebugCheckbox.checked) {
    debugBox.innerHTML = '📄 Wysyłanie pliku do konwersji...';
    debugBox.classList.remove('d-none');
  }
  
  fetch('convert.php', {
    method: 'POST',
    body: formData
  })
    .then(response => {
      if (toggleDebugCheckbox.checked) {
        debugBox.innerHTML += '<br>📡 Otrzymano odpowiedź, status: ' + response.status;
      }
      return response.text();
    })
    .then(text => {
      if (toggleDebugCheckbox.checked) {
        debugBox.innerHTML += '<br>📄 Surowa odpowiedź (pierwsze 500 znaków):<br><pre style="background:#f0f0f0;padding:10px;overflow:auto;max-height:200px;">' + 
          text.substring(0, 500).replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre>';
      }
      
      let data;
      try {
        data = JSON.parse(text);
        if (toggleDebugCheckbox.checked) {
          debugBox.innerHTML += '<br>✅ JSON poprawnie sparsowany';
        }
      } catch (e) {
        if (toggleDebugCheckbox.checked) {
          debugBox.innerHTML += '<br>❌ Błąd parsowania JSON: ' + e.message;
        }
        document.getElementById('warningBox').classList.remove('d-none');
        loadingSpinner.classList.add('d-none');
        return;
      }
      
      if (data.Successful) {
        convertedTextarea.value = text;
        if (toggleDebugCheckbox.checked) {
          debugBox.innerHTML += '<br>✅ Plik został pomyślnie przekonwertowany';
        }
        parseMenu(text);
        loadHistory();
      } else {
        if (toggleDebugCheckbox.checked) {
          debugBox.innerHTML += '<br>❌ Konwersja nieudana: ' + (data.Error || 'Nieznany błąd');
          if (Array.isArray(data.Log)) {
            debugBox.innerHTML += '<br>' + data.Log.map(step => '• ' + String(step).replace(/</g, '&lt;')).join('<br>');
          }
        }
        // Serwer podaje konkretny powód (np. nieobsługiwany format, nieczytelne zdjęcie)
        const warningBox = document.getElementById('warningBox');
        warningBox.textContent = data.Error || 'Zawartość pliku nie jest zgodna z oczekiwaniami!';
        warningBox.classList.remove('d-none');
      }
    })
    .catch(error => {
      if (toggleDebugCheckbox.checked) {
        debugBox.innerHTML += '<br>❌ Błąd podczas przesyłania pliku: ' + error.message;
      }
      document.getElementById('warningBox').classList.remove('d-none');
    })
    .finally(() => {
      loadingSpinner.classList.add('d-none');
    });
}

// ============================================
// CZĘŚĆ 5: PARSOWANIE MENU
// ============================================

function updateDishVisualState(cell, isChecked) {
  if (window.innerWidth <= 768) {
    cell.classList.remove('selected', 'unselected');
    if (isChecked) {
      cell.classList.add('selected');
    } else {
      cell.classList.add('unselected');
    }
  }
}

// -------------------------------------------------------------------
// Nowa ścieżka: jadłospis rozpoznany na serwerze (dane.Format === 'table',
// patrz menu_parser.php). Dni, dania, miesiąc i rok są już gotowe, a uwagi
// parsera (np. brakujące dni, daty wyliczone z nazw dni) są w dane.Warnings.
// -------------------------------------------------------------------

// Rok jadłospisu podany przez serwer (ważne dla starszych jadłospisów z historii);
// bez niego rok wyliczamy jak dawniej z dzisiejszej daty
let menuYearFromFile = null;

function showParseWarnings(warnings) {
  const box = document.getElementById('parseWarnings');
  if (!box) return;
  box.innerHTML = '';
  if (!warnings || !warnings.length) {
    box.classList.add('d-none');
    return;
  }
  const title = document.createElement('strong');
  title.textContent = 'Sprawdź jadłospis:';
  const list = document.createElement('ul');
  warnings.forEach(text => {
    const item = document.createElement('li');
    item.textContent = text;
    list.appendChild(item);
  });
  box.append(title, list);
  box.classList.remove('d-none');
}

function parseMenuFromTableData(dane, ctx) {
  const { debugEnabled, debugBox, menuTableBody } = ctx;

  try {
    menuTableBody.innerHTML = '';
    menuYearFromFile = Number(dane.Year) || null;
    showParseWarnings(dane.Warnings);
    document.getElementById('warningBox')?.classList.add('d-none');

    const parsedDates = {};
    let monthNumber = Number(dane.Month) || 0;
    let monthName = getMonthName(monthNumber);

    dane.Days.forEach(d => {
      const parts = String(d.date || '').split('.');
      if (parts.length !== 2) return;
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      const dateKey = `${day}.${month}`;
      if (!dane.Month) {
        monthNumber = parseInt(month, 10) || monthNumber;
        monthName = getMonthName(monthNumber) || monthName;
      }

      parsedDates[dateKey] = {
        pierwszeDanie: (d.zupa || '').trim() || null,
        drugieDanie: (d.drugieDanie || '').trim() || null,
        deser: (d.deser || '').trim(),
        alergeny: (d.alergeny || '').trim()
      };

      if (debugEnabled && debugBox) {
        debugBox.innerHTML += `🔎 ${dateKey}: 🥣 ${d.zupa || '-'} | 🍽️ ${d.drugieDanie || '-'}` +
          (d.deser ? ` | 🍰 ${d.deser}` : '') + (d.alergeny ? ` | ⚠️ ${d.alergeny}` : '') + '<br>';
      }
    });

    if (!monthNumber) {
      document.getElementById('warningBox')?.classList.remove('d-none');
      if (debugEnabled && debugBox) debugBox.innerHTML += '❌ Nie udało się ustalić miesiąca z jadłospisu.<br>';
      return;
    }

    // Jeśli convert.php znalazło cennik w dokumencie, zaktualizuj pola z cenami
    // automatycznie - dzięki temu przy każdej zmianie cen w jadłospisie
    // aplikacja nie wymaga już ręcznej edycji kodu.
    if (dane.Prices) {
      const firstPriceInput = document.getElementById('firstCoursePrice');
      const secondPriceInput = document.getElementById('secondCoursePrice');
      const comboPriceInput = document.getElementById('comboPrice');
      if (dane.Prices.zupa != null && firstPriceInput) firstPriceInput.value = dane.Prices.zupa.toFixed(2);
      if (dane.Prices.drugie != null && secondPriceInput) secondPriceInput.value = dane.Prices.drugie.toFixed(2);
      if (dane.Prices.zestaw != null && comboPriceInput) comboPriceInput.value = dane.Prices.zestaw.toFixed(2);
    }

    renderMenuCalendar(parsedDates, monthNumber, monthName, { debugEnabled, debugBox, menuTableBody });
  } catch (error) {
    document.getElementById('warningBox')?.classList.remove('d-none');
    if (debugEnabled && debugBox) {
      debugBox.innerHTML = `❌ Błąd parsowania (format tabelaryczny):<br>${error.message}<br><pre>${error.stack}</pre>`;
    } else {
      console.error('❌ Błąd parseMenuFromTableData:', error);
    }
  }
}

function parseMenu(jsonTekst) {
  // Zapamiętany do listy "Moje deklaracje" (ponowne otwarcie miesiąca)
  currentMenuSource = typeof jsonTekst === 'string' ? jsonTekst : JSON.stringify(jsonTekst);
  try {
    const toggleDebugElem = document.getElementById('toggleDebug') || window.toggleDebugCheckbox;
    const debugEnabled = !!(toggleDebugElem && toggleDebugElem.checked);
    const debugBox = document.getElementById('debugBox');
    const menuTableBody = document.querySelector('#menuTable tbody');

    let dane;
    try {
      dane = (typeof jsonTekst === 'object' && jsonTekst !== null) ? jsonTekst : JSON.parse(jsonTekst);
    } catch (e) {
      dane = { Successful: true, TextResult: String(jsonTekst) };
    }

    // Nowy format: jadłospis rozpoznany bezpośrednio z tabel pliku .docx
    // (patrz convert.php -> parseMenuDocxTables). Nie ma tu TextResult do
    // parsowania liniowego - dni są już gotowe w dane.Days.
    if (dane && dane.Successful && dane.Format === 'table' && Array.isArray(dane.Days)) {
      parseMenuFromTableData(dane, { debugEnabled, debugBox, menuTableBody });
      return;
    }
    menuYearFromFile = null;
    showParseWarnings([]);

    if (!dane || !dane.Successful || !dane.TextResult) {
      document.getElementById('warningBox')?.classList.remove('d-none');
      if (debugEnabled && debugBox) debugBox.innerHTML = 'Brak pola TextResult lub Successful=false';
      return;
    }

    let tekstMenu = dane.TextResult;

    if (!tekstMenu && typeof jsonTekst === 'string') {
      try {
        const maybe = JSON.parse(jsonTekst);
        if (maybe && maybe.TextResult) tekstMenu = maybe.TextResult;
      } catch (_) {}
    }

    if (typeof tekstMenu === 'string') {
      const ttrim = tekstMenu.trim();
      if (ttrim.startsWith('{') || ttrim.includes('"TextResult"')) {
        try {
          const nested = JSON.parse(tekstMenu);
          if (nested && nested.TextResult) tekstMenu = nested.TextResult;
        } catch (_) {}
      }
    }

    if (typeof tekstMenu === 'string') {
      tekstMenu = tekstMenu.replace(/\\\\r/g, '\\r').replace(/\\\\n/g, '\\n');
      tekstMenu = tekstMenu.replace(/\\r/g, '\r').replace(/\\n/g, '\n');
      tekstMenu = tekstMenu.replace(/\u00A0/g, ' ')
                           .replace(/[\u200B\u200C\u200D]+/g, '')
                           .replace(/\t+/g, ' ')
                           .replace(/[ ]{2,}/g, ' ')
                           .replace(/\r/g, '');
    }

    const linie = (typeof tekstMenu === 'string') ? tekstMenu.split('\n').map(l => l.trim()).filter(l => l !== '') : [];

    if (!menuTableBody) {
      if (debugEnabled && debugBox) debugBox.innerHTML = 'Brak elementu #menuTable tbody w DOM';
      return;
    }
    menuTableBody.innerHTML = '';

    let lp = 1;
    const parsedDates = {};
    let monthName = '';
    let monthNumber = 0;

    const dateRe = /([A-ZĄĆĘŁŃÓŚŹŻ]+\s+)?(\d{1,2})\.(\d{1,2})/i;

    for (let linia of linie) {
      const dateMatch = linia.match(dateRe);
      if (dateMatch) {
        const day = String(dateMatch[2]).padStart(2, '0');
        const month = String(dateMatch[3]).padStart(2, '0');
        const dateKey = `${day}.${month}`;
        monthNumber = parseInt(month, 10) || monthNumber;
        monthName = getMonthName(monthNumber) || monthName;
        parsedDates[dateKey] = { pierwszeDanie: null, drugieDanie: null };
        if (debugEnabled && debugBox) debugBox.innerHTML = (debugBox.innerHTML || '') + `🔎 Rozpoznano datę: ${dateKey} (${linia})<br>`;
        continue;
      }

      if (!linia || linia.length < 5 || linia.match(/^(DESER|SOBOTA|NIEDZIELA)$/i)) {
        continue;
      }

      const keys = Object.keys(parsedDates);
      const lastKey = keys.length ? keys[keys.length - 1] : null;
      
      if (lastKey && parsedDates[lastKey].pierwszeDanie === null) {
        parsedDates[lastKey].pierwszeDanie = linia;
        if (debugEnabled && debugBox) debugBox.innerHTML += `🲲 Pierwsze danie dla ${lastKey}: ${linia}<br>`;
      } else if (lastKey && parsedDates[lastKey].drugieDanie === null) {
        parsedDates[lastKey].drugieDanie = linia;
        if (debugEnabled && debugBox) debugBox.innerHTML += `🥘 Drugie danie dla ${lastKey}: ${linia}<br>`;
      } else {
        if (debugEnabled && debugBox) debugBox.innerHTML += `⚠️ Nieprzypisana linia: "${linia}"<br>`;
      }
    }

    if (debugEnabled) {
      console.log('📊 Parsowane daty:', parsedDates);
      console.table(parsedDates);
    }

    renderMenuCalendar(parsedDates, monthNumber, monthName, { debugEnabled, debugBox, menuTableBody });
  } catch (error) {
    document.getElementById('warningBox')?.classList.remove('d-none');
    if ((document.getElementById('toggleDebug') && document.getElementById('toggleDebug').checked) && document.getElementById('debugBox')) {
      document.getElementById('debugBox').innerHTML = `❌ Błąd parsowania:<br>${error.message}<br><pre>${error.stack}</pre>`;
    } else {
      console.error('❌ Błąd parseMenu:', error);
    }
  }
}

// -------------------------------------------------------------------
// Wspólna dla obu formatów (tekstowego i tabelarycznego) funkcja, która
// buduje pełny kalendarz miesiąca w #menuTable na podstawie już
// rozpoznanych dań przypisanych do konkretnych dat (parsedDates).
// -------------------------------------------------------------------
function renderMenuCalendar(parsedDates, monthNumber, monthName, ctx) {
  const { debugEnabled, debugBox, menuTableBody } = ctx;
  let lp = 1;

  try {
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();

    console.log('📅 OKREŚLANIE ROKU:');
    console.log(`  Dzisiaj: ${today.toLocaleDateString('pl-PL')}`);
    console.log(`  Aktualny miesiąc: ${currentMonth}`);
    console.log(`  Parsowany miesiąc z menu: ${monthNumber}`);
    
    let targetYear = currentYear;
    
    if (monthNumber < currentMonth) {
      if (currentMonth - monthNumber > 6) {
        targetYear = currentYear + 1;
        console.log(`  ✅ Miesiąc ${monthNumber} po miesiącu ${currentMonth} → następny rok ${targetYear}`);
      } else {
        targetYear = currentYear;
        console.log(`  ✅ Używam bieżącego roku: ${targetYear}`);
      }
    } else if (monthNumber > currentMonth) {
      if (monthNumber - currentMonth > 6) {
        targetYear = currentYear - 1;
        console.log(`  ✅ Miesiąc ${monthNumber} przed miesiącem ${currentMonth} → poprzedni rok ${targetYear}`);
      } else {
        targetYear = currentYear;
        console.log(`  ✅ Używam bieżącego roku: ${targetYear}`);
      }
    } else {
      console.log(`  ✅ Ten sam miesiąc - używam bieżącego roku: ${targetYear}`);
    }

    if (menuYearFromFile) targetYear = menuYearFromFile;
    const monthString = String(monthNumber).padStart(2, '0');

    const firstDayOfMonth = new Date(targetYear, monthNumber - 1, 1);
    const lastDayOfMonth = new Date(targetYear, monthNumber, 0);

    console.log(`📅 KALENDARZ dla ${monthString}/${targetYear}:`);
    console.log(`  Pierwszy dzień: ${firstDayOfMonth.toLocaleDateString('pl-PL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`);
    console.log(`  Dzień tygodnia pierwszego dnia: ${firstDayOfMonth.getDay()} (0=Niedziela, 1=Poniedziałek, ...)`);
    console.log(`  Ostatni dzień: ${lastDayOfMonth.toLocaleDateString('pl-PL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`);

    const totalDays = lastDayOfMonth.getDate();
    let dateLogCount = 0;
    
    for (let day = 1; day <= totalDays; day++) {
      const currentDate = new Date(targetYear, monthNumber - 1, day);
      const dayOfWeek = getDayOfWeekPL(currentDate.getDay(), window.innerWidth <= 768);
      const dayOfMonth = String(day).padStart(2, '0');
      const dateKey = `${dayOfMonth}.${monthString}`;
      
      if (debugEnabled && dateLogCount < 5) {
        console.log(`  ${dateKey} → ${currentDate.toLocaleDateString('pl-PL', { weekday: 'long' })} (index: ${currentDate.getDay()})`);
        dateLogCount++;
      }
      
      const row = menuTableBody.insertRow();
      // Klasy dla CSS: weekendy są ukryte, poniedziałek zaczyna nowy tydzień
      if (currentDate.getDay() === 0 || currentDate.getDay() === 6) row.classList.add('weekend-row');
      if (currentDate.getDay() === 1) row.classList.add('week-start');
      row.dataset.wd = currentDate.getDay();
      row.insertCell().textContent = lp++;
      row.insertCell().textContent = dateKey;
      row.insertCell().textContent = dayOfWeek;
      
      const cellPierwsze = row.insertCell();
      cellPierwsze.classList.add('cell-first-dish');
      const cellWyborPierwsze = row.insertCell();
      cellWyborPierwsze.classList.add('cell-first-choice');
      const cellDrugie = row.insertCell();
      cellDrugie.classList.add('cell-second-dish');
      const cellWyborDrugie = row.insertCell();
      cellWyborDrugie.classList.add('cell-second-choice');

      if (parsedDates[dateKey]) {
        // Kliknięcie daty pokazuje opis dań z tego dnia (na telefonie nie ma dymków)
        row.classList.add('has-info');
        [row.cells[1], row.cells[2]].forEach(cell => cell.addEventListener('click', () => openDayInfo(row)));

        cellPierwsze.textContent = parsedDates[dateKey].pierwszeDanie || '';
        cellPierwsze.classList.add('dish-name', 'cell-first-dish');
        
        const checkboxPierwsze = document.createElement('input');
        checkboxPierwsze.type = 'checkbox';
        checkboxPierwsze.classList.add('form-check-input', 'dish-checkbox');
        checkboxPierwsze.checked = !!parsedDates[dateKey].pierwszeDanie;
        cellWyborPierwsze.appendChild(checkboxPierwsze);
        
        cellPierwsze.dataset.checked = checkboxPierwsze.checked;
        updateDishVisualState(cellPierwsze, checkboxPierwsze.checked);
        
        cellPierwsze.addEventListener('click', function(e) {
          if (window.innerWidth <= 768) {
            e.stopPropagation();
            checkboxPierwsze.checked = !checkboxPierwsze.checked;
            cellPierwsze.dataset.checked = checkboxPierwsze.checked;
            updateDishVisualState(cellPierwsze, checkboxPierwsze.checked);
            checkboxPierwsze.dispatchEvent(new Event('change'));
          }
        });

        cellDrugie.textContent = parsedDates[dateKey].drugieDanie || '';
        cellDrugie.classList.add('dish-name', 'cell-second-dish');
        // Dodatkowe info z tabeli jadłospisu (jeśli dostępne) - pokazywane
        // tylko w dymku z definicją, nie wchodzi do samej nazwy dania.
        if (parsedDates[dateKey].deser) cellDrugie.dataset.deser = parsedDates[dateKey].deser;
        if (parsedDates[dateKey].alergeny) cellDrugie.dataset.alergeny = parsedDates[dateKey].alergeny;
        
        const checkboxDrugie = document.createElement('input');
        checkboxDrugie.type = 'checkbox';
        checkboxDrugie.classList.add('form-check-input', 'dish-checkbox');
        checkboxDrugie.checked = !!parsedDates[dateKey].drugieDanie;
        cellWyborDrugie.appendChild(checkboxDrugie);
        
        cellDrugie.dataset.checked = checkboxDrugie.checked;
        updateDishVisualState(cellDrugie, checkboxDrugie.checked);
        
        cellDrugie.addEventListener('click', function(e) {
          if (window.innerWidth <= 768) {
            e.stopPropagation();
            checkboxDrugie.checked = !checkboxDrugie.checked;
            cellDrugie.dataset.checked = checkboxDrugie.checked;
            updateDishVisualState(cellDrugie, checkboxDrugie.checked);
            checkboxDrugie.dispatchEvent(new Event('change'));
          }
        });
        
        checkboxPierwsze.addEventListener('change', function() {
          updateDishVisualState(cellPierwsze, this.checked);
          saveSelections();
        });
        
        checkboxDrugie.addEventListener('change', function() {
          updateDishVisualState(cellDrugie, this.checked);
          saveSelections();
        });
      } else {
        row.classList.add('table-secondary');
      }
    }

    document.getElementById('summaryMonth') && (document.getElementById('summaryMonth').textContent = monthName);
    const summaryBox = document.getElementById('summaryBox');
    if (summaryBox) summaryBox.classList.remove('d-none');
    document.getElementById('fridgeCalendarSection')?.classList.remove('d-none');
    document.getElementById('mobileTotalBar')?.classList.remove('d-none');

    // Przywróć zapisane wybory użytkownika (jeśli istnieją dla tego miesiąca)
    const monthYear = getMonthYear();
    const savedSelections = loadSelections(monthYear);
    if (savedSelections) {
      applySelections(savedSelections);
      console.log(`✅ Przywrócono wybory dla ${monthYear}`);
    }

attachSummaryListeners();
    attachTooltipListeners();
    attachSelectAllListeners();
    // Stan przycisków "Wszystkie zupy / drugie" na telefonie
    if (window.innerWidth <= 768) {
      updateMobileButtonState('first');
      updateMobileButtonState('second');
    }
    afterMenuRendered();
    if (historyData.length) renderHistory();
  } catch (error) {
    document.getElementById('warningBox')?.classList.remove('d-none');
    if ((document.getElementById('toggleDebug') && document.getElementById('toggleDebug').checked) && document.getElementById('debugBox')) {
      document.getElementById('debugBox').innerHTML = `❌ Błąd parsowania:<br>${error.message}<br><pre>${error.stack}</pre>`;
    } else {
      console.error('❌ Błąd renderMenuCalendar:', error);
    }
  }
}

// ============================================
// CZĘŚĆ 6: FUNKCJE POMOCNICZE
// ============================================

function getMonthName(monthNumber) {
  const months = ["", "stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];
  return months[monthNumber] || "";
}

function getDayOfWeekPL(dayIndex, short = false) {
  if (short || window.innerWidth <= 768) {
    const daysShort = ["Ndz", "Pon", "Wt", "Śr", "Czw", "Pt", "Sob"];
    return daysShort[dayIndex];
  }
  const days = ["Niedziela", "Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota"];
  return days[dayIndex];
}

function attachSummaryListeners() {
  const firstCoursePriceInput = document.getElementById('firstCoursePrice');
  const secondCoursePriceInput = document.getElementById('secondCoursePrice');
  const comboPriceInput = document.getElementById('comboPrice');
  const rows = document.querySelectorAll('#menuTable tbody tr');
  const selectedFirstCoursesCountSpan = document.getElementById('selectedFirstCoursesCount');
  const totalFirstCoursesCostSpan = document.getElementById('totalFirstCoursesCost');
  const selectedSecondCoursesCountSpan = document.getElementById('selectedSecondCoursesCount');
  const totalSecondCoursesCostSpan = document.getElementById('totalSecondCoursesCost');
  const totalCostAllMealsSpan = document.getElementById('totalCostAllMeals');
// Aktualizuj przyciski mobilne przy każdej zmianie
  if (window.innerWidth <= 768) {
    updateMobileButtonState('first');
    updateMobileButtonState('second');
  }
  const updateSummary = () => {
    let countFirst = 0;
    let countSecond = 0;
    let countCombo = 0; // dni, gdzie wybrano ZARÓWNO zupę, jak i drugie danie (cena zestawu)

    rows.forEach(row => {
      if (!row.classList.contains('table-secondary')) {
        const checkboxes = row.querySelectorAll('input[type="checkbox"]');
        if (checkboxes.length === 2) {
          const firstChecked = checkboxes[0].checked;
          const secondChecked = checkboxes[1].checked;
          if (firstChecked && secondChecked) {
            countCombo++;
          } else if (firstChecked) {
            countFirst++;
          } else if (secondChecked) {
            countSecond++;
          }
        }
      }
    });

    const priceFirst = parseFloat(firstCoursePriceInput.value) || 0;
    const priceSecond = parseFloat(secondCoursePriceInput.value) || 0;
    // Cena zestawu (zupa + drugie danie tego samego dnia) - jeśli nie ma
    // osobnego pola z ceną zestawu, licz jak dotychczas jako sumę cen.
    const priceCombo = comboPriceInput && comboPriceInput.value !== ''
      ? (parseFloat(comboPriceInput.value) || 0)
      : (priceFirst + priceSecond);

    const totalFirstCost = countFirst * priceFirst;
    const totalSecondCost = countSecond * priceSecond;
    const totalComboCost = countCombo * priceCombo;
    const totalAllMealsCost = totalFirstCost + totalSecondCost + totalComboCost;

    // Liczby "zaznaczonych" zup/drugich dań pokazujemy łącznie z tymi
    // wybranymi w ramach zestawu, żeby liczniki się zgadzały z tabelą.
    selectedFirstCoursesCountSpan.textContent = countFirst + countCombo;
    totalFirstCoursesCostSpan.textContent = totalFirstCost.toFixed(2);
    selectedSecondCoursesCountSpan.textContent = countSecond + countCombo;
    totalSecondCoursesCostSpan.textContent = totalSecondCost.toFixed(2);
    totalCostAllMealsSpan.textContent = totalAllMealsCost.toFixed(2);

    // Dolny pasek na telefonie
    const mobileTotal = document.getElementById('mobileTotalCost');
    const mobileDays = document.getElementById('mobileMealDays');
    if (mobileTotal) mobileTotal.textContent = totalAllMealsCost.toFixed(2);
    if (mobileDays) mobileDays.textContent = countFirst + countSecond + countCombo;

    const comboInfoSpan = document.getElementById('comboSelectedInfo');
    if (comboInfoSpan) {
      comboInfoSpan.textContent = countCombo > 0
        ? `w tym ${countCombo} dni w cenie zestawu (${priceCombo.toFixed(2)} zł/dzień) = ${totalComboCost.toFixed(2)} zł`
        : '';
    }
  };

  firstCoursePriceInput.addEventListener('input', updateSummary);
  secondCoursePriceInput.addEventListener('input', updateSummary);
  if (comboPriceInput) comboPriceInput.addEventListener('input', updateSummary);
rows.forEach(row => {
    row.querySelectorAll('input[type="checkbox"]').forEach((checkbox, index) => {
      checkbox.addEventListener('change', () => {
        updateSummary();
        // Aktualizuj stan przycisku mobilnego po zmianie
        if (window.innerWidth <= 768) {
          const column = index === 0 ? 'first' : 'second';
          updateMobileButtonState(column);
        }
      });
    });
  });
  updateSummary();
}

// -------------------------------------------------------
// Opisy dań w dymkach
// -------------------------------------------------------
// Opisy daje dish_info.php: najpierw z bazy, a dania jeszcze nieopisane
// opisuje AI (albo słownik i Wikipedia) i zapisuje w bazie, więc o każde
// danie pytamy zewnętrzną usługę tylko raz.

const dishDescriptions = new Map(); // nazwa dania z tabeli -> { text, source }
const pendingDishNames = new Set();
const DISH_INFO_CHUNK = 15;
const DISH_SOURCE_LABELS = {
  ai: 'Opis przygotowany przez AI',
  wikipedia: 'Źródło: Wikipedia',
  slownik: 'Opis ze słownika strony'
};

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function dishTooltipContent(el) {
  const info = dishDescriptions.get(el.textContent.trim());
  let html;
  if (!info) {
    html = '<span class="dish-tip-note">Wczytuję opis dania</span>';
  } else if (info.text) {
    html = escapeHtml(info.text);
    if (DISH_SOURCE_LABELS[info.source]) {
      html += `<br><small class="dish-tip-note">${DISH_SOURCE_LABELS[info.source]}</small>`;
    }
  } else {
    html = '<span class="dish-tip-note">Brak opisu tego dania</span>';
  }
  if (el.dataset.deser) html += `<br><small>🍰 Deser: ${escapeHtml(el.dataset.deser)}</small>`;
  if (el.dataset.alergeny) html += `<br><small>⚠️ Alergeny: ${escapeHtml(el.dataset.alergeny)}</small>`;
  return html;
}

function refreshDishTooltips() {
  document.querySelectorAll('.dish-name').forEach(el => {
    if (el._tippy) el._tippy.setContent(dishTooltipContent(el));
  });
  refreshDayInfo();
}

// Pobiera opisy dań, których jeszcze nie znamy, po kilkanaście w jednym zapytaniu
async function fetchDishDescriptions(dishes) {
  const missing = dishes.filter(dish => !dishDescriptions.has(dish.name) && !pendingDishNames.has(dish.name));
  missing.forEach(dish => pendingDishNames.add(dish.name));
  const stats = {};
  for (let i = 0; i < missing.length; i += DISH_INFO_CHUNK) {
    const chunk = missing.slice(i, i + DISH_INFO_CHUNK);
    try {
      const response = await fetch('dish_info.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dishes: chunk, debug: toggleDebugCheckbox.checked })
      });
      const data = await response.json();
      if (!data.Successful) throw new Error(data.Detail || data.Error || 'brak odpowiedzi');
      chunk.forEach(dish => dishDescriptions.set(dish.name, data.Descriptions[dish.name] || { text: null, source: 'brak' }));
      Object.entries(data.Stats || {}).forEach(([source, count]) => { stats[source] = (stats[source] || 0) + count; });
    } catch (error) {
      console.warn('Opisy dań niedostępne:', error);
      chunk.forEach(dish => dishDescriptions.set(dish.name, { text: null, source: 'brak' }));
    }
    chunk.forEach(dish => pendingDishNames.delete(dish.name));
    refreshDishTooltips();
  }
  if (toggleDebugCheckbox.checked && missing.length) {
    debugBox.innerHTML += '<br><br><strong>📚 Opisy dań:</strong> ' +
      Object.entries(stats).map(([source, count]) => `${escapeHtml(source)}: ${count}`).join(', ');
  }
}

async function attachTooltipListeners() {
  const dishes = [];
  const seen = new Set();
  document.querySelectorAll('.dish-name').forEach(el => {
    const name = el.textContent.trim();
    if (!name || seen.has(name)) return;
    seen.add(name);
    dishes.push({ name, kind: el.classList.contains('cell-first-dish') ? 'zupa' : 'drugie' });
  });

  // Dymki tylko na komputerze; na telefonie opis pokazuje okno dnia (openDayInfo)
  if (window.innerWidth > 768) {
    try {
      await loadTooltipLibraries();
      const theme = document.body.classList.contains('dark-theme') ? 'dark' : 'light';
      document.querySelectorAll('.dish-name').forEach(el => {
        if (!el.textContent.trim()) return;
        if (el._tippy) el._tippy.setContent(dishTooltipContent(el));
        else tippy(el, { content: dishTooltipContent(el), allowHTML: true, theme, placement: 'top' });
      });
    } catch (error) {
      console.warn('Dymki z opisami dań niedostępne:', error);
    }
  }

  await fetchDishDescriptions(dishes);
}

function attachSelectAllListeners() {
  const selectAllFirst = document.getElementById('selectAllFirst');
  const selectAllSecond = document.getElementById('selectAllSecond');
  
  function updateCheckboxState(selectAllCheckbox, columnIndex) {
    const rows = document.querySelectorAll('#menuTable tbody tr');
    let checkedCount = 0;
    let totalCount = 0;
    
    rows.forEach(row => {
      if (!row.classList.contains('table-secondary')) {
        const checkboxes = row.querySelectorAll('input[type="checkbox"]');
        if (checkboxes[columnIndex]) {
          totalCount++;
          if (checkboxes[columnIndex].checked) {
            checkedCount++;
          }
        }
      }
    });
    
    if (checkedCount === 0) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
      selectAllCheckbox.classList.remove('indeterminate');
    } else if (checkedCount === totalCount) {
      selectAllCheckbox.checked = true;
      selectAllCheckbox.indeterminate = false;
      selectAllCheckbox.classList.remove('indeterminate');
    } else {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = true;
      selectAllCheckbox.classList.add('indeterminate');
    }
  }
  
  if (selectAllFirst) {
    selectAllFirst.addEventListener('change', function() {
      const rows = document.querySelectorAll('#menuTable tbody tr');
      const shouldCheck = !this.indeterminate && this.checked;
      
      rows.forEach(row => {
        if (!row.classList.contains('table-secondary')) {
          const checkboxes = row.querySelectorAll('input[type="checkbox"]');
          if (checkboxes[0]) {
            checkboxes[0].checked = shouldCheck;
            const cell = checkboxes[0].closest('tr').querySelector('.cell-first-dish');
            if (cell) {
              updateDishVisualState(cell, shouldCheck);
            }
            checkboxes[0].dispatchEvent(new Event('change'));
          }
        }
      });
      
      this.indeterminate = false;
      this.classList.remove('indeterminate');
    });
  }
  
  if (selectAllSecond) {
    selectAllSecond.addEventListener('change', function() {
      const rows = document.querySelectorAll('#menuTable tbody tr');
      const shouldCheck = !this.indeterminate && this.checked;
      
      rows.forEach(row => {
        if (!row.classList.contains('table-secondary')) {
          const checkboxes = row.querySelectorAll('input[type="checkbox"]');
          if (checkboxes[1]) {
            checkboxes[1].checked = shouldCheck;
            const cell = checkboxes[1].closest('tr').querySelector('.cell-second-dish');
            if (cell) {
              updateDishVisualState(cell, shouldCheck);
            }
            checkboxes[1].dispatchEvent(new Event('change'));
          }
        }
      });
      
      this.indeterminate = false;
      this.classList.remove('indeterminate');
    });
  }
  
  // Nasłuchuj zmian w checkboxach wierszy
  const rows = document.querySelectorAll('#menuTable tbody tr');
  rows.forEach(row => {
    const checkboxes = row.querySelectorAll('input[type="checkbox"]');
    if (checkboxes[0]) {
      checkboxes[0].addEventListener('change', () => {
        if (selectAllFirst) updateCheckboxState(selectAllFirst, 0);
      });
    }
    if (checkboxes[1]) {
      checkboxes[1].addEventListener('change', () => {
        if (selectAllSecond) updateCheckboxState(selectAllSecond, 1);
      });
    }
  });
  
  if (selectAllFirst) updateCheckboxState(selectAllFirst, 0);
  if (selectAllSecond) updateCheckboxState(selectAllSecond, 1);
}

// ============================================
// CZĘŚĆ 7: GENEROWANIE DEKLARACJI
// ============================================

generateDeclarationBtn.addEventListener('click', generateDeclaration);

// Przycisk "Deklaracja" z dolnego paska na telefonie
function goToDeclaration() {
  generateDeclaration();
  document.getElementById('declarationCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function generateDeclaration() {
  const rows = [...document.querySelectorAll('#menuTable tbody tr')];
  if (rows.length === 0) {
    document.getElementById('declarationTableContainer').innerHTML = '<p>Brak danych w tabeli.</p>';
    return;
  }

  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();
  
  let firstMonth = null;
  for (let i = 0; i < rows.length; i++) {
    const dateText = (rows[i].cells[1] && rows[i].cells[1].textContent) ? rows[i].cells[1].textContent.trim() : '';
    if (dateText) {
      const parts = dateText.split('.');
      if (parts.length === 2) {
        firstMonth = Number(parts[1]);
        break;
      }
    }
  }
  
  if (!firstMonth) {
    document.getElementById('declarationTableContainer').innerHTML = '<p>Nie można określić miesiąca.</p>';
    return;
  }
  
  let targetYear = currentYear;
  
  if (firstMonth < currentMonth) {
    if (currentMonth - firstMonth > 6) {
      targetYear = currentYear + 1;
    }
  } else if (firstMonth > currentMonth) {
    if (firstMonth - currentMonth > 6) {
      targetYear = currentYear - 1;
    }
  }
  if (menuYearFromFile) targetYear = menuYearFromFile;

  rows.forEach(r => {
    const dateText = (r.cells[1] && r.cells[1].textContent) ? r.cells[1].textContent.trim() : '';
    if (!dateText) {
      r._val = '-';
      r._wd = null;
      r._date = '';
      return;
    }

    const parts = dateText.split('.');
    const dd = Number(parts[0]);
    const mm = Number(parts[1]);
    const d = new Date(targetYear, mm - 1, dd);
    const wd = d.getDay();

    let v;
    if (r.classList.contains('table-secondary')) v = 'X';
    else {
      const checkboxes = r.querySelectorAll('input[type=checkbox]');
      const cb1 = checkboxes[0] || { checked: false };
      const cb2 = checkboxes[1] || { checked: false };
      v = cb1.checked && cb2.checked ? '3' : cb1.checked ? '1' : cb2.checked ? '2' : '-';
    }

    const ddStr = String(dd).padStart(2, '0');
    const mmStr = String(mm).padStart(2, '0');
    r._val = v;
    r._wd = wd;
    r._date = `${ddStr}.${mmStr}`;
  });

  let firstWorkingDayIndex = -1;
  for (let i = 0; i < rows.length; i++) {
    const wd = rows[i]._wd;
    if (wd >= 1 && wd <= 5) {
      firstWorkingDayIndex = i;
      break;
    }
  }

  if (firstWorkingDayIndex === -1) {
    document.getElementById('declarationTableContainer').innerHTML = '<p>Brak dni roboczych w miesiącu.</p>';
    return;
  }

  let html = '<table border="1" style="width:100%; border-collapse:collapse; table-layout:fixed;">';
  html += '<tbody>';

  let currentIndex = firstWorkingDayIndex;
  
  while (currentIndex < rows.length) {
    html += '<tr>';
    
    for (let col = 0; col < 5; col++) {
      const expectedWd = col + 1;
      
      if (currentIndex >= rows.length) {
        html += `<td style="border:1px solid black; padding:6px;">&nbsp;</td>`;
        continue;
      }

      const r = rows[currentIndex];
      const wd = r._wd;
      
      if (wd === 0 || wd === 6) {
        html += `<td style="border:1px solid black; padding:6px;">&nbsp;</td>`;
        if (col === 4) currentIndex++;
        continue;
      }

      if (wd === expectedWd) {
        const dateText = r._date || '';
        if (r._val === 'X') {
          html += `<td style="border:1px solid black; padding:6px; text-align:center;">
                     <div>${dateText}</div><div style="font-weight:600;">X</div>
                   </td>`;
        } else {
          html += `<td style="border:1px solid black; padding:6px; text-align:center;">
                     <div>${dateText}</div><div>${r._val}</div>
                   </td>`;
        }
        currentIndex++;
      } else {
        html += `<td style="border:1px solid black; padding:6px;">&nbsp;</td>`;
      }
    }
    
    html += '</tr>';
    
    while (currentIndex < rows.length) {
      const wd = rows[currentIndex]._wd;
      if (wd === 1) break;
      if (wd >= 2 && wd <= 5) break;
      currentIndex++;
    }
  }

  html += '</tbody></table>';
  document.getElementById('declarationTableContainer').innerHTML = html;
  document.getElementById('declarationActions').classList.remove('d-none');
  saveDeclarationSnapshot();
  // Od teraz tabela zmienia się razem z zaznaczeniami (CZĘŚĆ 17)
  declarationMonthShown = getMonthYear();
  document.getElementById('declarationLiveNote')?.classList.remove('d-none');
}

// ============================================
// CZĘŚĆ 8: KOPIOWANIE TABELI
// ============================================

function copyDeclarationTable() {
  flushDeclarationRefresh(); // tabela zgodna z ostatnimi zmianami
  const sourceTable = document.querySelector('#declarationTableContainer table');
  if (!sourceTable) {
    alert('Brak tabeli do skopiowania');
    return;
  }

  const copyContainer = document.createElement('div');
  copyContainer.style.cssText = `
    position: fixed;
    left: -9999px;
    top: -9999px;
    width: 800px;
  `;
  copyContainer.contentEditable = 'true';
  
  const newTable = document.createElement('table');
  newTable.style.cssText = `
    border-collapse: collapse;
    width: 100%;
    font-family: Arial, sans-serif;
    font-size: 11pt;
    table-layout: fixed;
  `;
  
  const tbody = document.createElement('tbody');
  
  const rows = sourceTable.querySelectorAll('tr');
  
  rows.forEach((sourceRow) => {
    const newRow = document.createElement('tr');
    
    const cells = sourceRow.querySelectorAll('td');
    cells.forEach((sourceCell) => {
      const newCell = document.createElement('td');
      
      newCell.style.cssText = `
        border: 1px solid #000;
        padding: 8px 4px;
        text-align: center;
        vertical-align: middle;
        width: 20%;
        height: 50px;
        background: white;
        color: black;
      `;
      
      const divs = sourceCell.querySelectorAll('div');
      
      if (divs.length === 2) {
        const date = divs[0].textContent.trim();
        const value = divs[1].textContent.trim();
        const isX = value === 'X';
        
        const dateDiv = document.createElement('div');
        dateDiv.textContent = date;
        dateDiv.style.cssText = `
          margin-bottom: 4px;
          font-size: 10pt;
          line-height: 1.2;
        `;
        
        const valueDiv = document.createElement('div');
        valueDiv.textContent = value;
        valueDiv.style.cssText = `
          font-weight: ${isX ? 'bold' : '600'};
          font-size: ${isX ? '14pt' : '12pt'};
          line-height: 1.2;
        `;
        
        newCell.appendChild(dateDiv);
        newCell.appendChild(valueDiv);
        
      } else if (divs.length === 1) {
        const text = divs[0].textContent.trim();
        const singleDiv = document.createElement('div');
        singleDiv.textContent = text;
        singleDiv.style.cssText = 'line-height: 1.2;';
        newCell.appendChild(singleDiv);
      } else {
        newCell.textContent = sourceCell.textContent.trim() || '\u00A0';
      }
      
      newRow.appendChild(newCell);
    });
    
    tbody.appendChild(newRow);
  });
  
  newTable.appendChild(tbody);
  copyContainer.appendChild(newTable);
  document.body.appendChild(copyContainer);
  
  try {
    const range = document.createRange();
    range.selectNodeContents(copyContainer);
    
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    
    if (navigator.clipboard && window.ClipboardItem) {
      const htmlContent = copyContainer.innerHTML;
      const textContent = copyContainer.innerText;
      
      const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
      const textBlob = new Blob([textContent], { type: 'text/plain' });
      
      navigator.clipboard.write([
        new ClipboardItem({
          'text/html': htmlBlob,
          'text/plain': textBlob
        })
      ]).then(() => {
        cleanupAndShowSuccess(copyContainer, selection);
      }).catch(() => {
        tryExecCommand(copyContainer, selection);
      });
    } else {
      tryExecCommand(copyContainer, selection);
    }
  } catch (error) {
    document.body.removeChild(copyContainer);
    showSimpleToast('❌ Nie udało się skopiować', 'error');
  }
}

function tryExecCommand(copyContainer, selection) {
  let success = false;
  try {
    success = document.execCommand('copy');
  } catch (err) {
    console.error('execCommand error:', err);
  }
  
  if (success) {
    cleanupAndShowSuccess(copyContainer, selection);
  } else {
    cleanupAndShowSuccess(copyContainer, selection, false);
  }
}

function cleanupAndShowSuccess(copyContainer, selection, showNotification = true) {
  if (selection) {
    selection.removeAllRanges();
  }
  if (copyContainer && copyContainer.parentNode) {
    document.body.removeChild(copyContainer);
  }
  
  if (showNotification) {
    showSimpleToast('✅ Tabela skopiowana! Wklej w emailu (Ctrl+V)', 'success');
    recordDeclarationSend('kopia');
  }
}

// ============================================
// CZĘŚĆ 9: WYSYŁANIE EMAILI (BEZ MODALI)
// ============================================

function showEmailForm() {
  syncFormData('pdf'); // Synchronizuj dane z PDF do EMAIL
  document.getElementById('emailFormSection').classList.remove('d-none');
  document.getElementById('pdfFormSection').classList.add('d-none');
  document.getElementById('emailFormSection').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function hideEmailForm() {
  document.getElementById('emailFormSection').classList.add('d-none');
}


window.closeGmailInstructions = function() {
  const modal = document.getElementById('gmailInstructionsModal');
  if (modal) modal.remove();
};

window.copyDeclarationHTMLAgain = function() {
  const htmlContent = localStorage.getItem('declarationHTML');
  if (htmlContent) {
    copyRichHTMLToClipboard(htmlContent, function(ok) {
      showSimpleToast(ok ? '✅ Skopiowano ponownie do schowka!' : '❌ Błąd kopiowania', ok ? 'success' : 'error');
    });
  } else {
    showSimpleToast('❌ Brak zapisanej deklaracji', 'error');
  }
};

// -------------------------------------------------------
// PODGLĄD DEKLARACJI - panel do skopiowania jednym kliknięciem
// -------------------------------------------------------

function showEmailPreviewPanel(htmlContent, emailTo, subject, clientType) {
  const old = document.getElementById('emailPreviewPanel');
  if (old) old.remove();

  const panel = document.createElement('div');
  panel.id = 'emailPreviewPanel';
  panel.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.75);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 99999;
    padding: 16px;
  `;

  const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyInner = bodyMatch ? bodyMatch[1] : htmlContent;

  const clientLabel = clientType === 'gmail' ? 'Gmail' : clientType === 'outlook' ? 'Outlook' : 'pocztę';
  const clientIcon  = clientType === 'gmail' ? '📧' : clientType === 'outlook' ? '📨' : '💻';

  panel.innerHTML = `
    <div style="
      background:#fff; border-radius:12px; max-width:720px; width:100%;
      max-height:90vh; display:flex; flex-direction:column;
      box-shadow:0 8px 40px rgba(0,0,0,0.4); overflow:hidden;
    ">
      <div style="
        background:#2c3e50; color:#fff; padding:16px 20px;
        display:flex; align-items:center; justify-content:space-between; flex-shrink:0;
      ">
        <div>
          <strong style="font-size:15px;">📧 Gotowa deklaracja do wysłania</strong><br>
          <small style="opacity:0.8;">Kliknij niebieski przycisk poniżej, a następnie otwórz ${clientLabel} i wklej (Ctrl+V / Cmd+V)</small>
        </div>
        <button onclick="document.getElementById('emailPreviewPanel').remove()" style="
          background:none; border:none; color:#fff; font-size:22px; cursor:pointer; padding:0 4px; line-height:1;
        ">✕</button>
      </div>

      <div style="
        padding:12px 20px; background:#f8f9fa; border-bottom:1px solid #dee2e6;
        display:flex; gap:10px; flex-wrap:wrap; flex-shrink:0; align-items:center;
      ">
        <button id="copyRichBtn" onclick="doRichCopyAndOpen('${clientType}','${encodeURIComponent(emailTo)}','${encodeURIComponent(subject)}')" style="
          background:#3498db; color:#fff; border:none; padding:10px 20px;
          border-radius:6px; cursor:pointer; font-size:14px; font-weight:bold;
          display:flex; align-items:center; gap:8px;
        ">
          <span>📋</span><span id="copyBtnLabel">1. Kopiuj deklarację</span>
        </button>
        <div id="copyStatus" style="color:#28a745; font-weight:bold; display:none;">✅ Skopiowano!</div>
        <div style="color:#6c757d; font-size:13px; flex:1; min-width:180px;">
          Po skopiowaniu otwórz ${clientLabel}, utwórz nową wiadomość i wklej (Ctrl+V / Cmd+V).
        </div>
        <button id="openClientBtn" onclick="openEmailClient('${clientType}','${encodeURIComponent(emailTo)}','${encodeURIComponent(subject)}')" style="
          background:#28a745; color:#fff; border:none; padding:10px 20px;
          border-radius:6px; cursor:pointer; font-size:14px; font-weight:bold;
          display:none; align-items:center; gap:8px;
        ">
          <span>${clientIcon}</span><span>2. Otwórz ${clientLabel}</span>
        </button>
      </div>

      <div style="flex:1; overflow-y:auto; padding:20px; background:#fff;">
        <div style="
          font-family:'Times New Roman',Times,serif; font-size:12pt;
          line-height:1.5; color:#000; user-select:text;
        ">${bodyInner}</div>
      </div>
    </div>
  `;

  document.body.appendChild(panel);
  localStorage.setItem('declarationHTML', htmlContent);
  window._pendingEmailHTML = htmlContent;
}

window.doRichCopyAndOpen = function(clientType, emailToEncoded, subjectEncoded) {
  const htmlContent = window._pendingEmailHTML || localStorage.getItem('declarationHTML') || '';
  if (!htmlContent) {
    showSimpleToast('❌ Brak treści do skopiowania', 'error');
    return;
  }

  copyRichHTMLToClipboard(htmlContent, function(ok) {
    const btn = document.getElementById('copyRichBtn');
    const label = document.getElementById('copyBtnLabel');
    const status = document.getElementById('copyStatus');
    const openBtn = document.getElementById('openClientBtn');

    if (ok) {
      if (btn) btn.style.background = '#28a745';
      if (label) label.textContent = 'Skopiowano!';
      if (status) status.style.display = 'block';
      if (openBtn) openBtn.style.display = 'flex';
      showSimpleToast('✅ Deklaracja skopiowana jako sformatowana tabela! Wklej ją w emailu (Ctrl+V).', 'success');
    } else {
      showSimpleToast('❌ Błąd kopiowania — zaznacz tekst w podglądzie ręcznie i skopiuj (Ctrl+C)', 'error');
    }
  });
};

window.openEmailClient = function(clientType, emailToEncoded, subjectEncoded) {
  const emailTo = decodeURIComponent(emailToEncoded);
  const subject = decodeURIComponent(subjectEncoded);
  if (clientType === 'gmail') {
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(emailTo)}&su=${encodeURIComponent(subject)}`, '_blank');
  } else if (clientType === 'outlook') {
    window.open(`https://outlook.live.com/mail/0/deeplink/compose?to=${encodeURIComponent(emailTo)}&subject=${encodeURIComponent(subject)}`, '_blank');
  } else {
    window.location.href = `mailto:${encodeURIComponent(emailTo)}?subject=${encodeURIComponent(subject)}`;
  }
  showSimpleToast('📧 Otworzono klienta pocztowego — wklej deklarację (Ctrl+V / Cmd+V)', 'info');
};

// Kopiuje HTML jako rich text (tabela) — akceptowany przez Gmail, Outlook
function copyRichHTMLToClipboard(htmlContent, callback) {
  if (navigator.clipboard && window.ClipboardItem) {
    const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
    navigator.clipboard.write([new ClipboardItem({ 'text/html': htmlBlob })])
      .then(() => callback && callback(true))
      .catch(() => copyRichFallback(htmlContent, callback));
  } else {
    copyRichFallback(htmlContent, callback);
  }
}

// Fallback: contenteditable + execCommand('copy') — kopiuje sformatowany HTML, nie surowy tekst
function copyRichFallback(htmlContent, callback) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:800px;';
  el.contentEditable = 'true';
  el.innerHTML = htmlContent;
  document.body.appendChild(el);
  try {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    const ok = document.execCommand('copy');
    sel.removeAllRanges();
    document.body.removeChild(el);
    callback && callback(ok);
  } catch (e) {
    document.body.removeChild(el);
    callback && callback(false);
  }
}

function sendViaGmail() {
  flushDeclarationRefresh(); // tabela zgodna z ostatnimi zmianami
  const emailTo = document.getElementById('emailTo').value;
  const childName = document.getElementById('childName').value || 'Dziecko';
  const monthYear = getMonthYear();
  const subject = `Deklaracja obiadowa - ${childName} - ${monthYear}`;
  const htmlContent = generateEmailHTML();
  showEmailPreviewPanel(htmlContent, emailTo, subject, 'gmail');
  recordDeclarationSend('gmail', emailTo);
}

function sendViaOutlook() {
  flushDeclarationRefresh(); // tabela zgodna z ostatnimi zmianami
  const emailTo = document.getElementById('emailTo').value;
  const childName = document.getElementById('childName').value || 'Dziecko';
  const subject = `Deklaracja obiadowa - ${childName} - ${getMonthYear()}`;
  const htmlContent = generateEmailHTML();
  showEmailPreviewPanel(htmlContent, emailTo, subject, 'outlook');
  recordDeclarationSend('outlook', emailTo);
}

function sendViaLocalClient() {
  flushDeclarationRefresh(); // tabela zgodna z ostatnimi zmianami
  const emailTo = document.getElementById('emailTo').value;
  const childName = document.getElementById('childName').value || 'Dziecko';
  const subject = `Deklaracja obiadowa - ${childName} - ${getMonthYear()}`;
  const htmlContent = generateEmailHTML();
  showEmailPreviewPanel(htmlContent, emailTo, subject, 'local');
  recordDeclarationSend('local', emailTo);
}

// STARA funkcja zachowana dla kompatybilności (używana np. przez copyDeclarationTable)
function copyHTMLToClipboard(htmlContent) {
  copyRichHTMLToClipboard(htmlContent, null);
}

function copyHTMLFallback(htmlContent) {
  copyRichFallback(htmlContent, null);
}

function generateEmailHTML() {
  const childName = document.getElementById('childName').value || '';
  const childClass = document.getElementById('childClass').value || '';
  const healthNotes = document.getElementById('healthNotes').value || 'brak';
  const monthYear = getMonthYear();
  const firstCoursePrice = document.getElementById('firstCoursePrice').value;
  const secondCoursePrice = document.getElementById('secondCoursePrice').value;
  const totalPrice = getComboPriceValue(firstCoursePrice, secondCoursePrice);

  const tableHTML = document.querySelector('#declarationTableContainer table')?.outerHTML || '';
  
  return generateFullHTMLEmail(childName, childClass, monthYear, firstCoursePrice, secondCoursePrice, totalPrice, healthNotes, tableHTML);
}

// Cena "zestawu" (zupa + drugie danie tego samego dnia) - jeśli w formularzu
// jest osobne pole #comboPrice (wypełniane automatycznie z cennika w
// jadłospisie), używamy go. W przeciwnym razie liczymy jak dawniej: sumę cen.
function getComboPriceValue(firstCoursePrice, secondCoursePrice) {
  const comboInput = document.getElementById('comboPrice');
  if (comboInput && comboInput.value !== '') {
    return parseFloat(comboInput.value).toFixed(2);
  }
  return (parseFloat(firstCoursePrice) + parseFloat(secondCoursePrice)).toFixed(2);
}

function getMonthYear() {
  // Pobierz wiersze z tabeli menu
  const rows = document.querySelectorAll('#menuTable tbody tr');
  if (rows.length === 0) return '';
  
  // Znajdź pierwszą datę
  const firstDate = rows[0].cells[1]?.textContent || '';
  const parts = firstDate.split('.');
  
  if (parts.length !== 2) return '';
  
  const month = parseInt(parts[1]);
  
  // Określ rok (ta sama logika co w parseMenu)
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  let targetYear = currentYear;
  
  if (month < currentMonth) {
    if (currentMonth - month > 6) {
      targetYear = currentYear + 1;
    }
  } else if (month > currentMonth) {
    if (month - currentMonth > 6) {
      targetYear = currentYear - 1;
    }
  }
  
  if (menuYearFromFile) targetYear = menuYearFromFile;

  // Nazwy miesięcy w MIANOWNIKU (nieodmienione)
  const monthNames = ['', 'STYCZEŃ', 'LUTY', 'MARZEC', 'KWIECIEŃ', 'MAJ', 'CZERWIEC', 
                      'LIPIEC', 'SIERPIEŃ', 'WRZESIEŃ', 'PAŹDZIERNIK', 'LISTOPAD', 'GRUDZIEŃ'];
  
  return `${monthNames[month]} ${targetYear}`;
}

// Rok szkolny miesiąca z deklaracji (wrzesień 2026 to 2026/2027, nawet gdy deklaracja
// powstaje w sierpniu); bez jadłospisu w tabeli liczony od dzisiejszej daty
function getSchoolYear() {
  const period = getMenuPeriod();
  const now = new Date();
  const year = period ? period.year : now.getFullYear();
  const month = period ? period.month : now.getMonth() + 1;
  if (month >= 9) {
    return `${year}/${year + 1}`;
  } else {
    return `${year - 1}/${year}`;
  }
}

function getCurrentDate() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  return `${day}.${month}.${year}`;
}

function generateFullHTMLEmail(childName, childClass, monthYear, firstPrice, secondPrice, totalPrice, healthNotes, tableHTML) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { 
      font-family: 'Times New Roman', Times, serif; 
      font-size: 12pt;
      line-height: 1.5; 
      color: #000; 
      max-width: 700px; 
      margin: 20px auto; 
      padding: 20px;
    }
    .header { 
      text-align: center; 
      margin-bottom: 30px;
      font-weight: bold;
    }
    .header h2 { 
      font-size: 14pt; 
      margin: 5px 0;
      font-weight: bold;
    }
    table { 
      border-collapse: collapse; 
      width: 100%; 
      margin: 20px 0;
    }
    td { 
      border: 1px solid #000; 
      padding: 10px; 
      text-align: center; 
      font-size: 11pt;
      width: 20%;
      height: 40px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h2>KARTA ZGŁOSZENIA DZIECKA NA OBIADY</h2>
    <h2>w Katolickiej Szkole Podstawowej im. św. Jana Pawła II w Gdyni</h2>
    <h2>rok szkolny ${getSchoolYear()}</h2>
  </div>

  <p>Proszę o przyjęcie dziecka: <strong>${childName}</strong> z klasy <strong>${childClass}</strong></p>
  <p>na obiady – <strong>${monthYear.toUpperCase()}</strong> roku</p>

  <p>wpisz <strong>1</strong> – jeśli decydujesz się <strong>tylko na zupę cena – ${firstPrice} zł</strong></p>
  <p>wpisz <strong>2</strong> – jeśli decydujesz się na <strong>drugie danie – ${secondPrice} zł</strong></p>
  <p>wpisz <strong>3</strong> – jeśli decydujesz się na <strong>zupę i drugie danie – ${totalPrice} zł</strong></p>

  ${tableHTML}

  <h4>Zobowiązuję się do:</h4>
  <ol>
    <li>Regularnego wpłacania należności za obiady z góry gotówką – za zamówiony okres.</li>
    <li>Wpłaty przyjmowane będą tylko do 10 dnia miesiąca za miesiąc bieżący w sekretariacie szkoły.</li>
    <li>Zgłaszania nieobecności dziecka na obiadach najpóźniej do dnia następnego do godz. 8.00 mailem na adres: agnieszkakupczyk@katolik.info.pl</li>
    <li>Po godz. 8.00 zgłoszenia nieobecności nie będą uwzględniane.</li>
    <li>Tylko zgłoszone nieobecności będą odliczone przy płatności w następnym miesiącu.</li>
    <li>Deklaracje należy składać tylko elektronicznie na adres agnieszkakupczyk@katolik.info.pl</li>
    <li>Deklaracje na obiady należy składać do ostatniego dnia każdego miesiąca na kolejny miesiąc. Bieżący jadłospis jest wywieszany na tablicy ogłoszeń w skrzydle edukacji wczesnoszkolnej.</li>
  </ol>

  <p>Zalecenia zdrowotne: ${healthNotes}</p>
  <p>Gdynia, ${getCurrentDate()} r.</p>
</body>
</html>
  `;
}

// ============================================
// CZĘŚĆ 10: GENEROWANIE PDF
// ============================================

function showPDFForm() {
  // Biblioteki PDF pobieramy w tle, zanim użytkownik kliknie "Generuj"
  loadPdfLibraries().catch(() => {});
  loadScriptOnce(LAZY_SCRIPTS.html2canvas).catch(() => {});
  syncFormData('email'); // Synchronizuj dane z EMAIL do PDF
  document.getElementById('pdfFormSection').classList.remove('d-none');
  document.getElementById('emailFormSection').classList.add('d-none');
  document.getElementById('signatureSection').classList.add('d-none');
  document.getElementById('pdfFormSection').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function hidePDFForm() {
  document.getElementById('pdfFormSection').classList.add('d-none');
  document.getElementById('signatureSection').classList.add('d-none');
}

function toggleSignatureSection() {
  const section = document.getElementById('signatureSection');
  if (section.classList.contains('d-none')) {
    section.classList.remove('d-none');
    section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    initSignatureCanvas();
  } else {
    section.classList.add('d-none');
  }
}

async function generatePDFWithoutSignature() {
  flushDeclarationRefresh(); // tabela zgodna z ostatnimi zmianami
  const declarationTable = document.querySelector('#declarationTableContainer table');
  if (!declarationTable) {
    alert('❌ Najpierw wygeneruj tabelę deklaracji!');
    return;
  }
  
  const childName = document.getElementById('childNamePDF').value.trim() || '';
  const childClass = document.getElementById('childClassPDF').value.trim() || '';
  const healthNotes = document.getElementById('healthNotesPDF').value.trim() || 'brak';
  const monthYear = getMonthYear();
  const firstCoursePrice = document.getElementById('firstCoursePrice').value;
  const secondCoursePrice = document.getElementById('secondCoursePrice').value;
  const totalPrice = getComboPriceValue(firstCoursePrice, secondCoursePrice);
  // const totalPrice = 21.00; // Stała wartość 21.00 zł
  
  try {
    showSimpleToast('📄 Generowanie PDF...', 'info');
    
    await createPDFDocument(
      childName,
      childClass,
      monthYear,
      firstCoursePrice,
      secondCoursePrice,
      totalPrice,
      healthNotes,
      declarationTable,
      null
    );
    
    showSimpleToast('✅ PDF wygenerowany i pobrany!', 'success');
    recordDeclarationSend('pdf');
    
  } catch (error) {
    console.error('Błąd generowania PDF:', error);
    showSimpleToast('❌ Błąd podczas generowania PDF', 'error');
  }
}

async function generatePDFWithSignature() {
  flushDeclarationRefresh(); // tabela zgodna z ostatnimi zmianami
  if (!signatureCanvas || !signatureCtx) {
    alert('⚠️ Błąd: Canvas podpisu nie został zainicjalizowany!');
    return;
  }
  
  const imageData = signatureCanvas.toDataURL('image/png');
  const canvasData = signatureCtx.getImageData(0, 0, signatureCanvas.width, signatureCanvas.height);
  const isCanvasBlank = !canvasData.data.some(channel => channel !== 0);
  
  if (isCanvasBlank) {
    alert('⚠️ Proszę najpierw złożyć podpis!');
    return;
  }
  
  const childName = document.getElementById('childNamePDF').value.trim() || '';
  const childClass = document.getElementById('childClassPDF').value.trim() || '';
  const healthNotes = document.getElementById('healthNotesPDF').value.trim() || 'brak';
  const monthYear = getMonthYear();
  const firstCoursePrice = document.getElementById('firstCoursePrice').value;
  const secondCoursePrice = document.getElementById('secondCoursePrice').value;
  const totalPrice = getComboPriceValue(firstCoursePrice, secondCoursePrice);
    // const totalPrice = 21.00; // Stała wartość 21.00 zł

  const declarationTable = document.querySelector('#declarationTableContainer table');
  
  if (!declarationTable) {
    alert('❌ Błąd: Nie znaleziono tabeli z deklaracją!');
    return;
  }
  
  try {
    showSimpleToast('📄 Generowanie PDF z podpisem...', 'info');
    
    await createPDFDocument(
      childName,
      childClass,
      monthYear,
      firstCoursePrice,
      secondCoursePrice,
      totalPrice,
      healthNotes,
      declarationTable,
      imageData
    );
    
    showSimpleToast('✅ PDF z podpisem wygenerowany i pobrany!', 'success');
    recordDeclarationSend('pdf-podpis');
    
  } catch (error) {
    console.error('Błąd generowania PDF:', error);
    showSimpleToast('❌ Błąd podczas generowania PDF', 'error');
  }
}

// ============================================
// CZĘŚĆ 11: PODPIS (CANVAS)
// ============================================

function initSignatureCanvas() {
  signatureCanvas = document.getElementById('signatureCanvas');
  if (!signatureCanvas) return;
  
  signatureCtx = signatureCanvas.getContext('2d');
  
  signatureCtx.strokeStyle = '#000000';
  signatureCtx.lineWidth = 3;
  signatureCtx.lineCap = 'round';
  signatureCtx.lineJoin = 'round';
  
  signatureCanvas.addEventListener('mousedown', startDrawing);
  signatureCanvas.addEventListener('mousemove', draw);
  signatureCanvas.addEventListener('mouseup', stopDrawing);
  signatureCanvas.addEventListener('mouseout', stopDrawing);
  
  signatureCanvas.addEventListener('touchstart', handleTouchStart);
  signatureCanvas.addEventListener('touchmove', handleTouchMove);
  signatureCanvas.addEventListener('touchend', stopDrawing);
  
  // DODAJ TEN FRAGMENT NA KOŃCU:
  // Załaduj zapisany podpis
  const savedSignature = localStorage.getItem(STORAGE_KEYS.signature);
  if (savedSignature) {
    const img = new Image();
    img.onload = function() {
      signatureCtx.drawImage(img, 0, 0);
    };
    img.src = savedSignature;
  }
}

// Pozycja kursora/palca w układzie współrzędnych canvasa. Na telefonie
// canvas jest zmniejszony przez CSS, więc trzeba przeliczyć skalę.
function getSignaturePoint(clientX, clientY) {
  const rect = signatureCanvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left) * (signatureCanvas.width / rect.width),
    y: (clientY - rect.top) * (signatureCanvas.height / rect.height)
  };
}

function startDrawing(e) {
  isDrawing = true;
  const point = getSignaturePoint(e.clientX, e.clientY);
  signatureCtx.beginPath();
  signatureCtx.moveTo(point.x, point.y);
}

function draw(e) {
  if (!isDrawing) return;

  const point = getSignaturePoint(e.clientX, e.clientY);
  signatureCtx.lineTo(point.x, point.y);
  signatureCtx.stroke();
}

function stopDrawing() {
  if (isDrawing) {
    // Zapisz podpis do localStorage
    if (signatureCanvas) {
      const signatureData = signatureCanvas.toDataURL('image/png');
      localStorage.setItem(STORAGE_KEYS.signature, signatureData);
    }
  }
  isDrawing = false;
  signatureCtx.beginPath();
}

function handleTouchStart(e) {
  e.preventDefault();
  const touch = e.touches[0];
  const point = getSignaturePoint(touch.clientX, touch.clientY);
  isDrawing = true;
  signatureCtx.beginPath();
  signatureCtx.moveTo(point.x, point.y);
}

function handleTouchMove(e) {
  e.preventDefault();
  if (!isDrawing) return;

  const touch = e.touches[0];
  const point = getSignaturePoint(touch.clientX, touch.clientY);
  signatureCtx.lineTo(point.x, point.y);
  signatureCtx.stroke();
}

function clearSignature() {
  if (!signatureCtx || !signatureCanvas) return;
  signatureCtx.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
  // Usuń zapisany podpis
  localStorage.removeItem(STORAGE_KEYS.signature);
}

function changeSignatureColor(color) {
  if (!signatureCtx) return;
  signatureCtx.strokeStyle = color;
}

function changeSignatureThickness(thickness) {
  if (!signatureCtx) return;
  signatureCtx.lineWidth = thickness;
}

// ============================================
// CZĘŚĆ 12: TOAST NOTIFICATIONS
// ============================================

// Wygląd i animacje powiadomień są w styles.css (.app-toast).
// Kilka powiadomień naraz układa się jedno pod drugim w #toastStack.
function showSimpleToast(message, type = 'info') {
  let stack = document.getElementById('toastStack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toastStack';
    stack.setAttribute('aria-live', 'polite');
    document.body.appendChild(stack);
  }

  const toast = document.createElement('div');
  toast.className = `app-toast app-toast-${type}`;
  toast.textContent = message;
  stack.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('app-toast-hide');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ============================================
// CZĘŚĆ 13: FUNKCJA TWORZENIA PDF (jsPDF)
// ============================================

async function createPDFDocument(childName, childClass, monthYear, firstPrice, secondPrice, totalPrice, healthNotes, table, signatureImage) {
  await Promise.all([loadPdfLibraries(), loadScriptOnce(LAZY_SCRIPTS.html2canvas)]);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: 'p',
    unit: 'mm',
    format: 'a4',
    putOnlyUsedFonts: true,
    compress: true,
  });

  console.log('🔍 Sprawdzanie czcionek...');
  
  if (typeof registerTinosFonts === 'function') {
    console.log('📝 Rejestracja czcionek Tinos...');
    try {
      await registerTinosFonts(doc);
      console.log('✅ Czcionki zarejestrowane!');
    } catch (error) {
      console.error('❌ Błąd rejestracji czcionek:', error);
    }
  } else {
    console.error('❌ Funkcja registerTinosFonts NIE ISTNIEJE!');
  }

  const M_LEFT = 20;
  const M_RIGHT = 190;
  const PAGE_BOTTOM = 277;
  let yPos = 20;

  function drawDottedLine(x, y, width) {
    const dot = '.';
    doc.setFont('Tinos', 'normal');
    doc.setFontSize(11);
    const dotW = doc.getTextWidth(dot);
    if (dotW <= 0) return;
    const count = Math.floor(width / dotW);
    const dots = dot.repeat(count);
    doc.text(dots, x, y);
  }

  // Nagłówek
  doc.setFontSize(11);
  doc.setFont('Tinos', 'bold');
  doc.text('KARTA ZGŁOSZENIA DZIECKA NA OBIADY', 105, yPos, { align: 'center' });
  yPos += 5;

  doc.setFontSize(11);
  doc.text('w Katolickiej Szkole Podstawowej im. św. Jana Pawła II w Gdyni', 105, yPos, { align: 'center' });
  yPos += 5;

  doc.setFontSize(11);
  doc.text(`rok szkolny ${getSchoolYear()}`, 105, yPos, { align: 'center' });
  yPos += 12;

  // Proszę o przyjęcie dziecka
  doc.setFontSize(11);
  doc.setFont('Tinos', 'normal');
  
  const line1 = 'Proszę o przyjęcie dziecka';
  const line1Width = doc.getTextWidth(line1);

  if (childName && childName.trim()) {
    doc.setFont('Tinos', 'bold');
    doc.setFontSize(11);
    const nameX = M_LEFT + line1Width + 5;
    doc.text(childName.trim(), nameX, yPos);
  }
  
  if (childClass && childClass.trim()) {
    doc.setFont('Tinos', 'bold');
    doc.setFontSize(11);
    doc.text(childClass.trim(), M_RIGHT - 25, yPos);
  }
  yPos += 0.5;

  doc.text(line1, M_LEFT, yPos);
  drawDottedLine(M_LEFT + line1Width + 1, yPos, M_RIGHT - M_LEFT - line1Width - 1);
  yPos += 2.5;
  
  const labelY = yPos + 0.5;
  doc.setFont('Tinos', 'italic');
  doc.setFontSize(7);
  const nameLabel = 'i m i ę  i  n a z w i s k o';
  doc.text(nameLabel, M_LEFT + 45, labelY);
  doc.text('k l a s a', M_RIGHT - 25, labelY);
  
  yPos += 8;

  // Na obiady - MIESIĄC
  doc.setFontSize(11);
  doc.setFont('Tinos', 'normal');
  const pre = 'na obiady –';
  doc.text(pre, M_LEFT, yPos);
  let xPos = M_LEFT + doc.getTextWidth(pre) + 1;

  doc.setFont('Tinos', 'bold');
  const monthText = monthYear ? monthYear.toUpperCase() : 'PAŹDZIERNIK';
  doc.text(monthText, xPos, yPos);
  xPos += doc.getTextWidth(monthText) + 1;
  
  doc.setFont('Tinos', 'normal');
  doc.text(' roku', xPos, yPos);
  yPos += 8;

  // Legenda z cenami
  doc.setFontSize(12);
  doc.setFont('Tinos', 'normal');

  function drawLegendLine(num, desc, price) {
    let x = M_LEFT;
    doc.text('wpisz ', x, yPos);
    x += doc.getTextWidth('wpisz ');
    
    doc.setFont('Tinos', 'bold');
    doc.text(num, x, yPos);
    x += doc.getTextWidth(num);
    
    doc.setFont('Tinos', 'normal');
    doc.text(' – jeśli decydujesz się ', x, yPos);
    x += doc.getTextWidth(' – jeśli decydujesz się ');
    
    doc.setFont('Tinos', 'bold');
    doc.text(desc, x, yPos);
    x += doc.getTextWidth(desc);
    
    doc.setFont('Tinos', 'normal');
    doc.text(` – ${price} zł`, x, yPos);
    yPos += 6;
  }

  drawLegendLine('1', 'tylko na zupę cena', firstPrice || '8.50');
  drawLegendLine('2', 'na drugie danie', secondPrice || '18.00');
  drawLegendLine('3', 'na zupę i drugie danie', totalPrice || '23.50');
  yPos += 3;

  // Tabela
  if (table) {
    const canvas = await html2canvas(table, { scale: 2, backgroundColor: '#ffffff' });
    const imgData = canvas.toDataURL('image/png');
    const imgWidth = 170;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    if (yPos + imgHeight > PAGE_BOTTOM - 20) {
      doc.addPage();
      yPos = 20;
    }

    doc.addImage(imgData, 'PNG', M_LEFT, yPos, imgWidth, imgHeight);
    yPos += imgHeight + 6;
  }

  // Zobowiązuję się do:
  if (yPos + 80 > PAGE_BOTTOM) {
    doc.addPage();
    yPos = 20;
  }
  
  doc.setFontSize(11);
  doc.setFont('Tinos', 'normal');
  doc.text('Zobowiązuję się do:', M_LEFT, yPos);
  yPos += 7;

  const indent = M_LEFT + 6;
  const textWidth = M_RIGHT - indent;

  // Punkt 1
  doc.setFontSize(11);
  doc.setFont('Tinos', 'bold');
  doc.text('1.', M_LEFT, yPos);
  doc.setFont('Tinos', 'normal');
  
  let x = indent;
  doc.text('Regularnego wpłacania należności za obiady z góry ', x, yPos);
  x += doc.getTextWidth('Regularnego wpłacania należności za obiady z góry ');
  
  const highlight = 'gotówką';
  doc.setFont('Tinos', 'bold');
  const hlW = doc.getTextWidth(highlight);
  doc.setFillColor(255, 255, 0);
  doc.rect(x - 0.5, yPos - 3.5, hlW + 1, 4.5, 'F');
  doc.text(highlight, x, yPos);
  doc.setLineWidth(0.4);
  doc.line(x, yPos + 0.5, x + hlW, yPos + 0.5);
  x += hlW;
  
  doc.setFont('Tinos', 'normal');
  doc.text(' – za zamówiony okres.', x, yPos);
  yPos += 5.5;

  // Punkt 2
  doc.setFont('Tinos', 'bold');
  doc.text('2.', M_LEFT, yPos);
  doc.setFont('Tinos', 'normal');
  x = indent;
  
  doc.text('Wpłaty przyjmowane będą ', x, yPos);
  x += doc.getTextWidth('Wpłaty przyjmowane będą ');
  
  doc.setTextColor(255, 0, 0);
  doc.setFont('Tinos', 'bold');
  doc.text('tylko do 10 dnia', x, yPos);
  x += doc.getTextWidth('tylko do 10 dnia');
  
  doc.setTextColor(0, 0, 0);
  doc.setFont('Tinos', 'normal');
  doc.text(' miesiąca za miesiąc bieżący w sekretariacie', x, yPos);
  yPos += 5.5;
  doc.text('szkoły.', indent, yPos);
  yPos += 5.5;

  // Punkt 3
  doc.setFont('Tinos', 'bold');
  doc.text('3.', M_LEFT, yPos);
  doc.setFont('Tinos', 'normal');
  x = indent;
  
  doc.text('Zgłaszania nieobecności dziecka na obiadach najpóźniej ', x, yPos);
  x += doc.getTextWidth('Zgłaszania nieobecności dziecka na obiadach najpóźniej ');
  
  doc.setFont('Tinos', 'bold');
  doc.text('do dnia następnego do godz. 8.00', x, yPos);
  yPos += 5.5;
  
  x = indent;
  doc.text('mailem na adres: ', x, yPos);
  x += doc.getTextWidth('mailem na adres: ');
  
  doc.setTextColor(255, 0, 0);
  doc.text('agnieszkakupczyk@katolik.info.pl', x, yPos);
  doc.setTextColor(0, 0, 0);
  yPos += 5.5;

  // Punkt 4
  doc.setFont('Tinos', 'bold');
  doc.text('4.', M_LEFT, yPos);
  doc.text('Po godz. 8.00 zgłoszenia nieobecności nie będą uwzględniane.', indent, yPos);
  yPos += 5.5;

  // Punkt 5
  doc.text('5.', M_LEFT, yPos);
  const p5 = 'Tylko zgłoszone nieobecności będą odliczone przy płatności w następnym miesiącu.';
  const p5Lines = doc.splitTextToSize(p5, textWidth);
  doc.text(p5Lines, indent, yPos);
  yPos += p5Lines.length * 5.5;

  // Punkt 6
  doc.setTextColor(255, 0, 0);
  doc.text('6.', M_LEFT, yPos);
  doc.setFont('Tinos', 'normal');
  x = indent;
  
  doc.text('Deklaracje należy ', x, yPos);
  x += doc.getTextWidth('Deklaracje należy ');
  
  doc.setFont('Tinos', 'bold');
  doc.text('składać tylko elektronicznie na adres', x, yPos);
  yPos += 5.5;
  
  x = indent;
  doc.text('agnieszkakupczyk@katolik.info.pl', x, yPos);
  doc.setTextColor(0, 0, 0);
  yPos += 5.5;

  // Punkt 7
  doc.setFont('Tinos', 'bold');
  doc.text('7.', M_LEFT, yPos);
  const p7 = 'Deklaracje na obiady należy składać do ostatniego dnia każdego miesiąca na kolejny miesiąc.';
  const p7Lines = doc.splitTextToSize(p7, textWidth);
  doc.text(p7Lines, indent, yPos);
  yPos += p7Lines.length * 5.5 + 1;

  // Tekst wcięty
  doc.setFont('Tinos', 'normal');
  const indent2 = indent + 3;
  const indented = 'Bieżący jadłospis jest wywieszany na tablicy ogłoszeń w skrzydle edukacji wczesnoszkolnej';
  const indentedLines = doc.splitTextToSize(indented, M_RIGHT - indent2);
  doc.text(indentedLines, indent2, yPos);
  yPos += indentedLines.length * 5.5 + 3;

  // Punkt 8 - Zalecenia zdrowotne
  doc.setFont('Tinos', 'bold');
  doc.text('8.', M_LEFT, yPos);
  doc.setFont('Tinos', 'normal');
  x = indent;
  
  const healthLabel = 'Ewentualne zalecenia zdrowotne dziecka';
  const healthLabelW = doc.getTextWidth(healthLabel);
  
  if (healthNotes && healthNotes.trim()) {
    doc.setFontSize(12);
    doc.setFont('Tinos', 'normal');
    const noteX = x + healthLabelW + 10;
    doc.text(healthNotes.trim(), noteX, yPos);
  }
  yPos += 0.5;

  doc.text(healthLabel, x, yPos);
  drawDottedLine(x + healthLabelW + 1, yPos, M_RIGHT - x - healthLabelW - 1);
  yPos += 5.5;
  
  drawDottedLine(M_LEFT, yPos, M_RIGHT - M_LEFT);
  yPos += 8;

  // Data i podpis
  if (yPos + 30 > PAGE_BOTTOM) {
    doc.addPage();
    yPos = 20;
  }
  yPos += 3;

  doc.setFontSize(11);
  doc.setFont('Tinos', 'normal');

  const fullDateText = `Gdynia, dnia ${getCurrentDate()} r.`;
  doc.text(fullDateText, M_LEFT, yPos);

  const sigStartX = 130;
  yPos += 10;

  if (signatureImage) {
    const signatureWidth = 50;
    const signatureHeight = 20;
    doc.addImage(signatureImage, 'PNG', sigStartX + 5, yPos - 18, signatureWidth, signatureHeight);
  }
  
  drawDottedLine(sigStartX, yPos, M_RIGHT - sigStartX);

  doc.setFontSize(9);
  doc.setFont('Tinos', 'italic');
  const sigLabel = 'podpisy rodziców /prawnych opiekunów';
  const sigLabelW = doc.getTextWidth(sigLabel);
  doc.text(sigLabel, (sigStartX + M_RIGHT) / 2 - sigLabelW / 2, yPos+5);

  // Zapisz PDF
// Zapisz PDF z poprawnym formatem nazwy
  let firstName = '';
  let lastName = '';
  
  if (childName && childName.trim()) {
    const nameParts = childName.trim().split(/\s+/);
    if (nameParts.length >= 2) {
      firstName = nameParts[0];
      lastName = nameParts.slice(1).join('_').toUpperCase(); // Nazwisko WIELKIMI LITERAMI
    } else {
      firstName = nameParts[0];
    }
  }
  
  // Wyczyść znaki specjalne
  const cleanFirstName = firstName.replace(/[^a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, '');
  const cleanLastName = lastName.replace(/[^a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, '');
  
  // Format: Deklaracja_Imię_NAZWISKO_STYCZEŃ_2026.pdf
  let fileName = 'Deklaracja';
  if (cleanFirstName) fileName += `_${cleanFirstName}`;
  if (cleanLastName) fileName += `_${cleanLastName}`;
  if (monthYear) fileName += `_${monthYear.replace(/\s+/g, '_')}`;
  fileName += '.pdf';
  
  doc.save(fileName);
}

// ============================================
// CZĘŚĆ 14: OBSŁUGA RESPONSIVE
// ============================================

let resizeTimer;
window.addEventListener('resize', function() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(function() {
    const rows = document.querySelectorAll('#menuTable tbody tr');
    rows.forEach((row) => {
      const dateCell = row.cells[1];
      const dayCell = row.cells[2];
      if (dateCell && dayCell) {
        const dateParts = dateCell.textContent.split('.');
        if (dateParts.length === 2) {
          const day = parseInt(dateParts[0]);
          const month = parseInt(dateParts[1]);
          const year = menuYearFromFile || new Date().getFullYear();
          const date = new Date(year, month - 1, day);
          dayCell.textContent = getDayOfWeekPL(date.getDay(), window.innerWidth <= 768);
        }
      }
    });
    
    document.querySelectorAll('.dish-name').forEach(cell => {
      const row = cell.parentElement;
      const checkboxes = row.querySelectorAll('.dish-checkbox');
      
      let checkbox = null;
      if (cell.classList.contains('cell-first-dish')) {
        checkbox = checkboxes[0];
      } else if (cell.classList.contains('cell-second-dish')) {
        checkbox = checkboxes[1];
      }
      
      if (checkbox) {
        updateDishVisualState(cell, checkbox.checked);
      }
    });
    
    if (window.innerWidth > 768) {
      attachTooltipListeners();
    }
  }, 250);
});

// ============================================
// NOWA FUNKCJA: Toggle dla kolumn mobilnych
// ============================================

window.toggleMobileColumn = function(column) {
  const rows = document.querySelectorAll('#menuTable tbody tr');
  const columnIndex = column === 'first' ? 0 : 1;
  
  // Sprawdź aktualny stan
  let checkedCount = 0;
  let totalCount = 0;
  
  rows.forEach(row => {
    if (!row.classList.contains('table-secondary')) {
      const checkboxes = row.querySelectorAll('input[type="checkbox"]');
      if (checkboxes[columnIndex]) {
        totalCount++;
        if (checkboxes[columnIndex].checked) {
          checkedCount++;
        }
      }
    }
  });
  
  // Określ nowy stan (cycle: none -> all -> none)
  let newState;
  if (checkedCount === 0) {
    newState = true; // Zaznacz wszystkie
  } else {
    newState = false; // Odznacz wszystkie
  }
  
  // Zastosuj nowy stan
  rows.forEach(row => {
    if (!row.classList.contains('table-secondary')) {
      const checkboxes = row.querySelectorAll('input[type="checkbox"]');
      if (checkboxes[columnIndex]) {
        checkboxes[columnIndex].checked = newState;
        const cellClass = column === 'first' ? '.cell-first-dish' : '.cell-second-dish';
        const cell = row.querySelector(cellClass);
        if (cell) {
          updateDishVisualState(cell, newState);
        }
        checkboxes[columnIndex].dispatchEvent(new Event('change'));
      }
    }
  });
  
  // Zaktualizuj przycisk
  updateMobileButtonState(column);
  
  // Zaktualizuj checkbox w nagłówku
  const selectAllId = column === 'first' ? 'selectAllFirst' : 'selectAllSecond';
  const selectAllCheckbox = document.getElementById(selectAllId);
  if (selectAllCheckbox) {
    selectAllCheckbox.checked = newState;
    selectAllCheckbox.indeterminate = false;
    selectAllCheckbox.classList.remove('indeterminate');
  }
  
  // Toast
  const message = newState 
    ? `✅ Zaznaczono wszystkie ${column === 'first' ? 'zupy' : 'drugie dania'}`
    : `❌ Odznaczono wszystkie ${column === 'first' ? 'zupy' : 'drugie dania'}`;
  showSimpleToast(message, 'success');
};

function updateMobileButtonState(column) {
  const rows = document.querySelectorAll('#menuTable tbody tr');
  const columnIndex = column === 'first' ? 0 : 1;
  const button = document.querySelector(`.mobile-toggle-btn[data-column="${column}"]`);
  
  if (!button) return;
  
  let checkedCount = 0;
  let totalCount = 0;
  
  rows.forEach(row => {
    if (!row.classList.contains('table-secondary')) {
      const checkboxes = row.querySelectorAll('input[type="checkbox"]');
      if (checkboxes[columnIndex]) {
        totalCount++;
        if (checkboxes[columnIndex].checked) {
          checkedCount++;
        }
      }
    }
  });
  
  // Usuń wszystkie klasy stanu
  button.classList.remove('state-all', 'state-none', 'state-partial');
  
  // Dodaj odpowiednią klasę
  if (checkedCount === 0) {
    button.classList.add('state-none');
  } else if (checkedCount === totalCount) {
    button.classList.add('state-all');
  } else {
    button.classList.add('state-partial');
  }
}

// Dodaj wywołanie updateMobileButtonState w attachSummaryListeners

// ============================================
// CZĘŚĆ 15: ANALYTICS (Privacy-friendly)
// ============================================

(function() {
  const userAgent = navigator.userAgent.toLowerCase();
  const isBot = /bot|crawler|spider|crawling/i.test(userAgent);
  
  if (isBot) {
    console.log('🤖 Bot wykryty - pomijam logowanie');
    return;
  }
  
  const analyticsData = {
    page: window.location.pathname,
    screen: screen.width + 'x' + screen.height,
    lang: navigator.language || navigator.userLanguage || 'unknown',
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown',
    device: getDeviceType(),
    time: 0,
    scroll: 0
  };
  
  function getDeviceType() {
    const ua = navigator.userAgent;
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
      return 'tablet';
    }
    if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
      return 'mobile';
    }
    return 'desktop';
  }
  
  const startTime = Date.now();
  
  let maxScroll = 0;
  function updateScroll() {
    const scrolled = window.scrollY;
    const height = document.documentElement.scrollHeight - window.innerHeight;
    const scrollPercent = height > 0 ? Math.round((scrolled / height) * 100) : 0;
    maxScroll = Math.max(maxScroll, scrollPercent);
  }
  
  window.addEventListener('scroll', updateScroll, { passive: true });
  
  function sendAnalytics(includeTimeAndScroll = false) {
    if (includeTimeAndScroll) {
      analyticsData.time = Math.round((Date.now() - startTime) / 1000);
      analyticsData.scroll = maxScroll;
    }
    
    fetch('log_visit.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(analyticsData),
      keepalive: true
    })
    .then(r => r.json())
    .catch(err => console.error('Analytics error:', err));
  }
  
  sendAnalytics(false);
  
  window.addEventListener('beforeunload', function() {
    sendAnalytics(true);
  });
  
  setTimeout(function() {
    sendAnalytics(true);
  }, 30000);
  
})();

// ============================================
// CZĘŚĆ 16: KALENDARZ NA LODÓWKĘ (TXT, DOCX, PDF)
// ============================================
// Miesięczny kalendarz dni szkolnych (pon-pt): w które dni dziecko ma
// zamówioną zupę i/lub drugie danie. Opcjonalnie z nazwami dań.

const FRIDGE_STATUSES = {
  full:    { label: 'Zupa + drugie danie',     fill: 'E3F5EA', accent: '1F9D63' },
  main:    { label: 'Tylko drugie danie',      fill: 'E5EEFC', accent: '2F74E0' },
  soup:    { label: 'Tylko zupa',              fill: 'FDF0D9', accent: 'B9740A' },
  nothing: { label: 'Nic nie wybrano',         fill: 'FFFFFF', accent: '6B7A72' },
  none:    { label: 'Dzień bez obiadu w menu', fill: 'EEF1ED', accent: '6B7A72' }
};

const FRIDGE_DISHES = {
  soup: { label: 'Zupa', color: 'D98B0F' },
  main: { label: 'Drugie danie', color: '2F74E0' }
};

const FRIDGE_WEEKDAYS = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek'];
const FRIDGE_DETAIL_KEY = 'fridge_calendar_detail';

// Zapamiętany wybór "z nazwami dań / bez nazw"
document.querySelectorAll('input[name="fridgeDetail"]').forEach(input => {
  if (input.value === localStorage.getItem(FRIDGE_DETAIL_KEY)) input.checked = true;
  input.addEventListener('change', () => localStorage.setItem(FRIDGE_DETAIL_KEY, input.value));
});

async function downloadFridgeCalendar(format) {
  const cal = collectFridgeCalendar();
  if (!cal) {
    alert('❌ Najpierw wczytaj jadłospis i wybierz obiady!');
    return;
  }
  cal.withNames = document.querySelector('input[name="fridgeDetail"]:checked')?.value === 'names';

  try {
    const fileName = getFridgeCalendarFileName(cal, format);
    if (format === 'txt') {
      // BOM, żeby Notatnik na pewno rozpoznał polskie znaki
      downloadBlob(new Blob(['﻿' + buildFridgeCalendarText(cal)], { type: 'text/plain;charset=utf-8' }), fileName);
    } else if (format === 'docx') {
      downloadBlob(new Blob([buildFridgeCalendarDocx(cal)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), fileName);
    } else if (format === 'pdf') {
      showSimpleToast('📄 Generowanie PDF...', 'info');
      const doc = await buildFridgeCalendarPdf(cal);
      doc.save(fileName);
    }
    showSimpleToast('✅ Kalendarz pobrany!', 'success');
  } catch (error) {
    console.error('Błąd generowania kalendarza:', error);
    showSimpleToast('❌ Błąd podczas generowania kalendarza', 'error');
  }
}

// Zbiera z tabeli #menuTable stan każdego dnia roboczego i nazwy zamówionych
// dań, pogrupowane w tygodnie po 5 dni (null = dzień spoza miesiąca).
function collectFridgeCalendar() {
  const rows = [...document.querySelectorAll('#menuTable tbody tr')];
  const monthYear = getMonthYear();
  if (!rows.length || !monthYear) return null;

  // Rok bierzemy z getMonthYear(), żeby zgadzał się z deklaracją
  const year = parseInt(monthYear.split(' ').pop(), 10);
  const weeks = [];
  const counts = { full: 0, main: 0, soup: 0, nothing: 0, none: 0 };
  let week = null;
  let lastWeekday = 0;

  rows.forEach(row => {
    const dateKey = (row.cells[1]?.textContent || '').trim();
    const [dd, mm] = dateKey.split('.').map(Number);
    if (!dd || !mm) return;
    const date = new Date(year, mm - 1, dd);
    const weekday = date.getDay();
    if (weekday === 0 || weekday === 6) return;

    const checkboxes = row.querySelectorAll('input[type="checkbox"]');
    const soupChecked = !!checkboxes[0]?.checked;
    const mainChecked = !!checkboxes[1]?.checked;
    let status = 'nothing';
    if (row.classList.contains('table-secondary')) status = 'none';
    else if (soupChecked && mainChecked) status = 'full';
    else if (mainChecked) status = 'main';
    else if (soupChecked) status = 'soup';
    counts[status]++;

    if (!week || weekday <= lastWeekday) {
      week = [null, null, null, null, null];
      weeks.push(week);
    }
    lastWeekday = weekday;

    week[weekday - 1] = {
      date,
      dateKey,
      status,
      soup: soupChecked ? row.cells[3].textContent.trim() : '',
      main: mainChecked ? row.cells[5].textContent.trim() : ''
    };
  });

  if (!weeks.length) return null;

  const childName = (document.getElementById('childName')?.value || document.getElementById('childNamePDF')?.value || '').trim();
  const childClass = (document.getElementById('childClass')?.value || document.getElementById('childClassPDF')?.value || '').trim();
  return { monthYear, childName, childClass, weeks, counts, withNames: false };
}

// Dania zamówione danego dnia: [['soup', nazwa], ['main', nazwa]]
function getFridgeDayDishes(day) {
  const dishes = [];
  if (day.status === 'full' || day.status === 'soup') dishes.push(['soup', day.soup]);
  if (day.status === 'full' || day.status === 'main') dishes.push(['main', day.main]);
  return dishes;
}

// "PAŹDZIERNIK 2026" -> "Październik 2026"
function formatFridgeMonthTitle(monthYear) {
  const [month, year] = monthYear.split(' ');
  return month.charAt(0) + month.slice(1).toLowerCase() + ' ' + year;
}

function getFridgeCalendarSubtitle(cal) {
  return [cal.childName, cal.childClass ? `klasa ${cal.childClass}` : ''].filter(Boolean).join(', ');
}

function formatDaysCount(count) {
  return `${count} ${count === 1 ? 'dzień' : 'dni'}`;
}

// Format: Kalendarz_obiadow_Imię_NAZWISKO_WRZESIEŃ_2026.pdf
function getFridgeCalendarFileName(cal, extension) {
  const clean = text => text.replace(/[^a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, '');
  const nameParts = cal.childName.split(/\s+/).filter(Boolean);
  const parts = ['Kalendarz_obiadow'];
  if (nameParts.length) parts.push(clean(nameParts[0]));
  if (nameParts.length > 1) parts.push(clean(nameParts.slice(1).join('')).toUpperCase());
  parts.push(cal.monthYear.replace(/\s+/g, '_'));
  return parts.filter(Boolean).join('_') + '.' + extension;
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildFridgeCalendarText(cal) {
  const indent = ' '.repeat(13);
  const lines = [`KALENDARZ OBIADÓW: ${formatFridgeMonthTitle(cal.monthYear)}`];
  const subtitle = getFridgeCalendarSubtitle(cal);
  if (subtitle) lines.push(subtitle);

  cal.weeks.forEach((week, index) => {
    const days = week.filter(Boolean);
    lines.push('', `TYDZIEŃ ${index + 1} (${days[0].dateKey} do ${days[days.length - 1].dateKey})`);
    days.forEach(day => {
      const weekday = getDayOfWeekPL(day.date.getDay(), true).padEnd(3);
      lines.push(`  ${weekday} ${day.dateKey}  ${FRIDGE_STATUSES[day.status].label}`);
      if (cal.withNames) {
        getFridgeDayDishes(day).forEach(([key, name]) => {
          if (name) lines.push(`${indent}${FRIDGE_DISHES[key].label.toLowerCase()}: ${name}`);
        });
      }
    });
  });

  lines.push('', 'PODSUMOWANIE');
  Object.entries(FRIDGE_STATUSES).forEach(([key, s]) => {
    if (cal.counts[key]) lines.push(`  ${s.label.padEnd(25)}${formatDaysCount(cal.counts[key])}`);
  });

  return lines.join('\r\n') + '\r\n';
}

// DOCX to archiwum ZIP z kilkoma plikami XML. Składamy je ręcznie,
// żeby nie dociągać kolejnej biblioteki z CDN. Dni to kolorowe kafelki:
// komórki tabeli z odstępem między nimi (tblCellSpacing).
function buildFridgeCalendarDocx(cal) {
  const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const OFFICE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const COL_W = 3100; // 5 kolumn na szerokość A4 w poziomie, w twipach
  const INK = '17211B';
  const MUTED = '6B7A72';

  const esc = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const run = (text, { bold = false, italic = false, caps = false, size = 20, color = INK, spacing = 0, fill = '' } = {}) =>
    '<w:r><w:rPr>' +
    (bold ? '<w:b/>' : '') + (italic ? '<w:i/>' : '') + (caps ? '<w:caps/>' : '') +
    `<w:color w:val="${color}"/>` + (spacing ? `<w:spacing w:val="${spacing}"/>` : '') +
    `<w:sz w:val="${size}"/>` +
    (fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : '') +
    `</w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
  const para = (runs, { align = '', before = 0, after = 0 } = {}) =>
    `<w:p><w:pPr><w:spacing w:before="${before}" w:after="${after}"/>${align ? `<w:jc w:val="${align}"/>` : ''}</w:pPr>${runs}</w:p>`;
  const dashed = ['top', 'left', 'bottom', 'right']
    .map(side => `<w:${side} w:val="dashed" w:sz="8" w:space="0" w:color="C2CCBF"/>`).join('');
  const cell = (content, fill = '', borders = '') =>
    `<w:tc><w:tcPr><w:tcW w:w="${COL_W}" w:type="dxa"/>` +
    (borders ? `<w:tcBorders>${borders}</w:tcBorders>` : '') +
    (fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : '') +
    `</w:tcPr>${content || para('')}</w:tc>`;

  const dayCell = day => {
    if (!day) return cell('');
    const s = FRIDGE_STATUSES[day.status];
    const dishes = getFridgeDayDishes(day);
    let content = para(run(String(day.date.getDate()), { bold: true, size: cal.withNames ? 30 : 34, color: dishes.length ? INK : '8A9790' }), { after: 40 });

    if (!dishes.length) {
      const nothing = day.status === 'nothing';
      content += para(run(s.label, { bold: nothing, italic: !nothing, size: nothing ? 19 : 17, color: MUTED }));
      return cell(content, nothing ? '' : s.fill, nothing ? dashed : '');
    }

    dishes.forEach(([key, name]) => {
      const dish = FRIDGE_DISHES[key];
      if (cal.withNames) {
        content += para(
          run('● ', { size: 15, color: dish.color }) +
          run(`${dish.label}: `, { bold: true, size: 15 }) +
          run(name || '', { size: 15, color: '3D4A43' }), { after: 30 });
      } else {
        content += para(run('● ', { size: 20, color: dish.color }) + run(dish.label, { bold: true, size: 21 }), { after: 20 });
      }
    });
    return cell(content, s.fill);
  };

  const headerRow = '<w:tr><w:trPr><w:tblHeader/></w:trPr>' +
    FRIDGE_WEEKDAYS.map(name => cell(para(run(name, { bold: true, caps: true, size: 16, color: MUTED, spacing: 10 }), { align: 'center' }))).join('') +
    '</w:tr>';
  // Wysokość wiersza dobrana tak, żeby cały miesiąc zmieścił się na jednej stronie
  // (Word dolicza do tego odstępy i marginesy komórek)
  const rowHeight = Math.min(1800, Math.floor(6900 / cal.weeks.length));
  const weekRows = cal.weeks.map(week =>
    `<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="${rowHeight}" w:hRule="atLeast"/></w:trPr>${week.map(dayCell).join('')}</w:tr>`
  ).join('');

  const noBorder = side => `<w:${side} w:val="nil"/>`;
  const table = '<w:tbl><w:tblPr>' +
    `<w:tblW w:w="${COL_W * 5}" w:type="dxa"/>` +
    '<w:tblCellSpacing w:w="45" w:type="dxa"/>' +
    `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(noBorder).join('')}</w:tblBorders>` +
    '<w:tblLayout w:type="fixed"/>' +
    '<w:tblCellMar><w:top w:w="100" w:type="dxa"/><w:left w:w="140" w:type="dxa"/>' +
    '<w:bottom w:w="80" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tblCellMar>' +
    `</w:tblPr><w:tblGrid>${`<w:gridCol w:w="${COL_W}"/>`.repeat(5)}</w:tblGrid>${headerRow}${weekRows}</w:tbl>`;

  const subtitle = getFridgeCalendarSubtitle(cal);
  const legend = para(Object.entries(FRIDGE_STATUSES)
    .filter(([key]) => cal.counts[key])
    .map(([key, s]) =>
      run(` ${s.label} `, { bold: true, size: 17, color: s.accent, fill: key === 'nothing' ? 'F1F3F0' : s.fill }) +
      run(` ${formatDaysCount(cal.counts[key])}      `, { size: 17, color: MUTED }))
    .join(''), { before: 100 });

  const body =
    para(run('Kalendarz obiadów', { bold: true, caps: true, size: 17, color: '1F9D63', spacing: 30 })) +
    para(run(formatFridgeMonthTitle(cal.monthYear), { bold: true, size: 50 }), { after: subtitle ? 0 : 160 }) +
    (subtitle ? para(run(subtitle, { size: 23, color: MUTED }), { after: 160 }) : '') +
    table + legend;

  const documentXml = `${XML_HEADER}<w:document ${W_NS}><w:body>${body}` +
    '<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>' +
    '<w:pgMar w:top="567" w:right="567" w:bottom="567" w:left="567" w:header="0" w:footer="0" w:gutter="0"/>' +
    '</w:sectPr></w:body></w:document>';

  const stylesXml = `${XML_HEADER}<w:styles ${W_NS}><w:docDefaults>` +
    '<w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/>' +
    '<w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="pl-PL"/></w:rPr></w:rPrDefault>' +
    '<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault>' +
    '</w:docDefaults></w:styles>';

  return createZip([
    { name: '[Content_Types].xml', content: XML_HEADER +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '</Types>' },
    { name: '_rels/.rels', content: XML_HEADER +
      `<Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="${OFFICE_REL}/officeDocument" Target="word/document.xml"/></Relationships>` },
    { name: 'word/_rels/document.xml.rels', content: XML_HEADER +
      `<Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="${OFFICE_REL}/styles" Target="styles.xml"/></Relationships>` },
    { name: 'word/document.xml', content: documentXml },
    { name: 'word/styles.xml', content: stylesXml }
  ]);
}

// Minimalny zapis ZIP bez kompresji (metoda "stored"), w zupełności
// wystarcza dla pliku DOCX. Zwraca Uint8Array.
function createZip(files) {
  const encoder = new TextEncoder();
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    return c >>> 0;
  });
  const crc32 = bytes => {
    let crc = 0xFFFFFFFF;
    for (const b of bytes) crc = crcTable[(crc ^ b) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  };

  const localParts = [];
  const centralParts = [];
  let offset = 0;

  files.forEach(({ name, content }) => {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);
    const crc = crc32(data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);  // sygnatura nagłówka pliku
    local.setUint16(4, 20, true);          // wersja potrzebna do rozpakowania
    local.setUint16(6, 0x0800, true);      // nazwy plików w UTF-8
    local.setUint16(12, 0x0021, true);     // data 1980-01-01
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    localParts.push(new Uint8Array(local.buffer), nameBytes, data);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true); // sygnatura wpisu katalogu centralnego
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint16(14, 0x0021, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, data.length, true);
    central.setUint32(24, data.length, true);
    central.setUint16(28, nameBytes.length, true);
    central.setUint32(42, offset, true);
    centralParts.push(new Uint8Array(central.buffer), nameBytes);

    offset += 30 + nameBytes.length + data.length;
  });

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);       // sygnatura końca archiwum
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  const parts = [...localParts, ...centralParts, new Uint8Array(end.buffer)];
  const zip = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let position = 0;
  parts.forEach(part => {
    zip.set(part, position);
    position += part.length;
  });
  return zip;
}

// Czcionka Plus Jakarta Sans (ta sama co na stronie) leży w folderze fonts/.
// Gdyby się nie wczytała, PDF powstaje z czcionką Tinos z fonts.js.
const CALENDAR_FONT_FILES = [
  ['PlusJakartaSans-Regular.ttf', 'Jakarta', 'normal'],
  ['PlusJakartaSans-SemiBold.ttf', 'Jakarta', 'bold'],
  ['PlusJakartaSans-ExtraBold.ttf', 'JakartaHeavy', 'normal']
];
let calendarFontData = null;

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

async function registerCalendarFonts(doc) {
  try {
    if (!calendarFontData) {
      calendarFontData = await Promise.all(CALENDAR_FONT_FILES.map(async ([file]) => {
        const response = await fetch('fonts/' + file);
        if (!response.ok) throw new Error('HTTP ' + response.status + ' dla ' + file);
        return arrayBufferToBase64(await response.arrayBuffer());
      }));
    }
    CALENDAR_FONT_FILES.forEach(([file, family, style], i) => {
      doc.addFileToVFS(file, calendarFontData[i]);
      doc.addFont(file, family, style);
    });
    return { regular: ['Jakarta', 'normal'], bold: ['Jakarta', 'bold'], heavy: ['JakartaHeavy', 'normal'] };
  } catch (error) {
    console.warn('Czcionka kalendarza niedostępna, używam Tinos:', error);
    await loadScriptOnce(LAZY_SCRIPTS.fonts);
    await registerTinosFonts(doc);
    return { regular: ['Tinos', 'normal'], bold: ['Tinos', 'bold'], heavy: ['Tinos', 'bold'] };
  }
}

async function buildFridgeCalendarPdf(cal) {
  await loadScriptOnce(LAZY_SCRIPTS.jspdf);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'l', unit: 'mm', format: 'a4', compress: true });
  const font = await registerCalendarFonts(doc);

  const rgb = hex => [0, 2, 4].map(i => parseInt(hex.substr(i, 2), 16));
  const PAGE_W = 297;
  const PAGE_H = 210;
  const M = 12;
  const GAP = 2.5;
  const colW = (PAGE_W - 2 * M - 4 * GAP) / 5;

  // Nagłówek: miesiąc po lewej, dziecko po prawej
  doc.setFont(...font.bold);
  doc.setFontSize(9);
  doc.setTextColor(...rgb('1F9D63'));
  doc.text('KALENDARZ OBIADÓW', M, 15, { charSpace: 0.5 });
  doc.setFont(...font.heavy);
  doc.setFontSize(26);
  doc.setTextColor(...rgb('17211B'));
  doc.text(formatFridgeMonthTitle(cal.monthYear), M, 26);
  if (cal.childName) {
    doc.setFont(...font.bold);
    doc.setFontSize(14);
    doc.text(cal.childName, PAGE_W - M, 19, { align: 'right' });
  }
  if (cal.childClass) {
    doc.setFont(...font.regular);
    doc.setFontSize(10.5);
    doc.setTextColor(...rgb('6B7A72'));
    doc.text(`klasa ${cal.childClass}`, PAGE_W - M, cal.childName ? 25.5 : 19, { align: 'right' });
  }

  // Nazwy dni tygodnia
  doc.setFont(...font.bold);
  doc.setFontSize(8.5);
  doc.setTextColor(...rgb('6B7A72'));
  FRIDGE_WEEKDAYS.forEach((name, i) => {
    doc.text(name.toUpperCase(), M + (colW + GAP) * i + colW / 2, 35, { align: 'center' });
  });

  // Kafelki dni: jeden wiersz na tydzień
  const gridTop = 38;
  const legendH = 12;
  const rows = cal.weeks.length;
  const cellH = Math.min(36, (PAGE_H - M - legendH - gridTop - GAP * (rows - 1)) / rows);
  cal.weeks.forEach((week, w) => {
    week.forEach((day, d) => {
      if (day) drawFridgePdfDay(doc, font, rgb, day, M + (colW + GAP) * d, gridTop + (cellH + GAP) * w, colW, cellH, cal.withNames);
    });
  });

  // Legenda z liczbą dni (zawija się, gdyby nie zmieściła się w jednej linii)
  let legendX = M;
  let legendY = gridTop + rows * (cellH + GAP) + 5;
  doc.setFontSize(9.5);
  Object.entries(FRIDGE_STATUSES).forEach(([key, s]) => {
    if (!cal.counts[key]) return;
    const label = `${s.label}: `;
    const count = formatDaysCount(cal.counts[key]);
    doc.setFont(...font.regular);
    const labelW = doc.getTextWidth(label);
    doc.setFont(...font.bold);
    const itemW = 7 + labelW + doc.getTextWidth(count);
    if (legendX + itemW > PAGE_W - M) {
      legendX = M;
      legendY += 6;
    }
    doc.setFillColor(...rgb(s.fill));
    doc.setDrawColor(...rgb('C2CCBF'));
    doc.setLineWidth(0.3);
    if (key === 'nothing') doc.setLineDashPattern([0.8, 0.6], 0);
    doc.roundedRect(legendX, legendY - 3.6, 4.6, 4.6, 1.2, 1.2, key === 'nothing' || key === 'none' ? 'FD' : 'F');
    doc.setLineDashPattern([], 0);
    doc.setFont(...font.regular);
    doc.setTextColor(...rgb('17211B'));
    doc.text(label, legendX + 7, legendY);
    doc.setFont(...font.bold);
    doc.text(count, legendX + 7 + labelW, legendY);
    legendX += itemW + 8;
  });

  return doc;
}

function drawFridgePdfDay(doc, font, rgb, day, x, y, w, h, withNames) {
  const s = FRIDGE_STATUSES[day.status];
  const dishes = getFridgeDayDishes(day);

  // Tło kafelka; "nic nie wybrano" ma białe tło z przerywaną ramką
  doc.setFillColor(...rgb(s.fill));
  if (day.status === 'nothing') {
    doc.setDrawColor(...rgb('C2CCBF'));
    doc.setLineWidth(0.35);
    doc.setLineDashPattern([1.2, 1], 0);
    doc.roundedRect(x, y, w, h, 3, 3, 'FD');
    doc.setLineDashPattern([], 0);
  } else {
    doc.roundedRect(x, y, w, h, 3, 3, 'F');
  }

  doc.setFont(...font.heavy);
  doc.setFontSize(17);
  doc.setTextColor(...rgb(dishes.length ? '17211B' : '8A9790'));
  doc.text(String(day.date.getDate()), x + 4, y + 8.5);

  if (!dishes.length) {
    const nothing = day.status === 'nothing';
    doc.setFont(...(nothing ? font.bold : font.regular));
    doc.setFontSize(nothing ? 11 : 9.5);
    doc.setTextColor(...rgb('6B7A72'));
    doc.splitTextToSize(s.label, w - 8).forEach((line, i) => doc.text(line, x + 4, y + 16 + i * 4.6));
    return;
  }

  // Bez nazw: kolorowa kropka i rodzaj dania
  if (!withNames) {
    let rowY = y + 16;
    dishes.forEach(([key]) => {
      const dish = FRIDGE_DISHES[key];
      doc.setFillColor(...rgb(dish.color));
      doc.circle(x + 5.4, rowY - 1.3, 1.4, 'F');
      doc.setFont(...font.bold);
      doc.setFontSize(11);
      doc.setTextColor(...rgb('17211B'));
      doc.text(dish.label, x + 8.6, rowY);
      rowY += 6.2;
    });
    return;
  }

  // Z nazwami: zmniejszamy czcionkę, aż tekst zmieści się w kafelku
  const textX = x + 8.6;
  const textW = w - 8.6 - 3;
  const availableH = h - 13;
  doc.setFont(...font.regular);
  let fontSize = 9.5;
  let lineH;
  let lines;
  do {
    fontSize -= 0.5;
    doc.setFontSize(fontSize);
    lineH = fontSize * 0.3528 * 1.22;
    lines = dishes.flatMap(([key, name]) => {
      const prefix = FRIDGE_DISHES[key].label + ': ';
      return doc.splitTextToSize(prefix + (name || ''), textW)
        .map((text, i) => ({ text, key, prefix: i === 0 ? prefix : '' }));
    });
  } while (lines.length * lineH > availableH && fontSize > 6.5);

  const maxLines = Math.floor(availableH / lineH);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    const last = lines[maxLines - 1];
    last.text = last.text.replace(/\s*\S*$/, '') + '...';
  }

  lines.forEach((line, i) => {
    const lineY = y + 12.5 + lineH * (i + 0.8);
    let text = line.text;
    let lineX = textX;
    if (line.prefix && text.startsWith(line.prefix)) {
      doc.setFillColor(...rgb(FRIDGE_DISHES[line.key].color));
      doc.circle(x + 5.4, lineY - fontSize * 0.12, 1.2, 'F');
      doc.setFont(...font.bold);
      doc.setTextColor(...rgb('17211B'));
      doc.text(line.prefix, lineX, lineY);
      lineX += doc.getTextWidth(line.prefix);
      text = text.slice(line.prefix.length);
    }
    doc.setFont(...font.regular);
    doc.setTextColor(...rgb('3D4A43'));
    doc.text(text, lineX, lineY);
  });
}

// ============================================
// CZĘŚĆ 15: MOJE DEKLARACJE (ZAPIS TYLKO W PRZEGLĄDARCE)
// ============================================
// Każdy zdeklarowany miesiąc (osobno dla każdego dziecka) zapisujemy w
// localStorage: wybrane obiady z nazwami dań, ceny, kwotę do zapłaty oraz
// historię wysyłek z treścią wysłanej deklaracji. Nic nie trafia na serwer.

const DECLARATIONS_KEY = 'meal_declarations_v1';
const DECLARATION_MONTHS = ['', 'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
const DECLARATION_SEND_LABELS = {
  gmail: 'e-mail (Gmail)',
  outlook: 'e-mail (Outlook)',
  local: 'e-mail (program pocztowy)',
  pdf: 'PDF',
  'pdf-podpis': 'PDF z podpisem',
  kopia: 'skopiowana tabela'
};
const DECLARATION_MAX_SENDS = 10;      // tyle wysyłek pamiętamy na miesiąc
const DECLARATION_HTML_SENDS = 3;      // treść deklaracji tylko dla ostatnich wysyłek
const openDeclarationKeys = new Set(); // rozwinięte pozycje zostają rozwinięte po odświeżeniu listy

// Jadłospis, z którego powstała tabela (do ponownego otwarcia miesiąca z listy)
let currentMenuSource = null;

function loadDeclarations() {
  try {
    const data = JSON.parse(localStorage.getItem(DECLARATIONS_KEY) || '{}');
    return data && typeof data === 'object' && data.entries ? data.entries : {};
  } catch (e) {
    return {};
  }
}

function storeDeclarations(entries) {
  const write = () => localStorage.setItem(DECLARATIONS_KEY, JSON.stringify({ entries }));
  try {
    write();
  } catch (e) {
    // Brak miejsca: usuwamy treść najstarszych wysyłek, dane i kwoty zostają
    Object.values(entries).forEach(entry => entry.sends.slice(0, -1).forEach(send => { delete send.html; }));
    try {
      write();
    } catch (e2) {
      console.warn('Nie udało się zapisać deklaracji w przeglądarce:', e2);
    }
  }
}

function formatMoney(value) {
  return Number(value || 0).toFixed(2).replace('.', ',') + ' zł';
}

function formatDateTime(iso, withTime) {
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  const date = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
  return withTime ? `${date}, ${pad(d.getHours())}:${pad(d.getMinutes())}` : date;
}

// Miesiąc i rok jadłospisu w tabeli (ta sama zasada co w getMonthYear)
function getMenuPeriod() {
  const label = getMonthYear();
  const firstDate = document.querySelector('#menuTable tbody tr')?.cells[1]?.textContent || '';
  const month = parseInt(firstDate.split('.')[1], 10);
  const year = parseInt(label.split(' ')[1], 10);
  return month && year ? { month, year } : null;
}

function getDeclarationChild() {
  const value = (id, fallbackId) => (document.getElementById(id)?.value || document.getElementById(fallbackId)?.value || '').trim();
  return {
    name: value('childName', 'childNamePDF'),
    cls: value('childClass', 'childClassPDF'),
    health: value('healthNotes', 'healthNotesPDF') || 'brak'
  };
}

function getDeclarationKey(period, childName) {
  return `${period.year}-${String(period.month).padStart(2, '0')}|${childName.toLowerCase().replace(/\s+/g, ' ')}`;
}

// Stan tabeli i podsumowania w tej chwili: dni, wybory, ceny i kwota (jak w updateSummary)
function buildDeclarationSnapshot() {
  const period = getMenuPeriod();
  const rows = [...document.querySelectorAll('#menuTable tbody tr')];
  if (!period || !rows.length) return null;

  const counts = { combo: 0, first: 0, second: 0 };
  const days = [];
  rows.forEach(row => {
    if (row.classList.contains('weekend-row')) return;
    const date = row.cells[1]?.textContent.trim();
    if (!date) return;
    const boxes = row.querySelectorAll('input[type="checkbox"]');
    const noLunch = row.classList.contains('table-secondary') || boxes.length < 2;
    const first = !noLunch && boxes[0].checked;
    const second = !noLunch && boxes[1].checked;
    if (first && second) counts.combo++;
    else if (first) counts.first++;
    else if (second) counts.second++;
    days.push({
      date,
      soup: noLunch ? '' : row.cells[3].textContent.trim(),
      main: noLunch ? '' : row.cells[5].textContent.trim(),
      first,
      second,
      noLunch
    });
  });

  const priceFirst = parseFloat(document.getElementById('firstCoursePrice')?.value) || 0;
  const priceSecond = parseFloat(document.getElementById('secondCoursePrice')?.value) || 0;
  const comboInput = document.getElementById('comboPrice');
  const priceCombo = comboInput && comboInput.value !== '' ? (parseFloat(comboInput.value) || 0) : priceFirst + priceSecond;
  const total = Math.round((counts.first * priceFirst + counts.second * priceSecond + counts.combo * priceCombo) * 100) / 100;

  return {
    period,
    monthYear: getMonthYear(),
    child: getDeclarationChild(),
    prices: { first: priceFirst, second: priceSecond, combo: priceCombo },
    counts,
    total,
    days
  };
}

// Zapisuje bieżący stan miesiąca; z $send dopisuje też wysyłkę (co i jak wysłano)
function saveDeclarationSnapshot(send) {
  const snapshot = buildDeclarationSnapshot();
  if (!snapshot) return;
  const entries = loadDeclarations();
  const key = getDeclarationKey(snapshot.period, snapshot.child.name);
  const now = new Date().toISOString();
  const entry = entries[key] || { createdAt: now, sends: [], paidAt: null };

  Object.assign(entry, {
    month: snapshot.period.month,
    year: snapshot.period.year,
    monthYear: snapshot.monthYear,
    child: snapshot.child,
    prices: snapshot.prices,
    counts: snapshot.counts,
    total: snapshot.total,
    days: snapshot.days,
    menu: currentMenuSource || entry.menu || null,
    updatedAt: now
  });

  if (send) {
    entry.sends.push({
      at: now,
      method: send.method,
      to: send.to || null,
      total: snapshot.total,
      counts: snapshot.counts,
      days: snapshot.days,
      html: send.html || null
    });
    entry.sends = entry.sends.slice(-DECLARATION_MAX_SENDS);
    entry.sends.slice(0, -DECLARATION_HTML_SENDS).forEach(old => { delete old.html; });
  }

  // Deklaracja zrobiona przed wpisaniem imienia dziecka i niewysłana: zastępujemy ją
  if (snapshot.child.name) {
    const unnamedKey = getDeclarationKey(snapshot.period, '');
    if (entries[unnamedKey] && !entries[unnamedKey].sends.length) delete entries[unnamedKey];
  }

  entries[key] = entry;
  storeDeclarations(entries);
  renderDeclarationArchive();
}

// Wysyłka zapamiętana razem z treścią deklaracji (jak w e-mailu)
function recordDeclarationSend(method, to) {
  const child = getDeclarationChild();
  const firstPrice = document.getElementById('firstCoursePrice')?.value || '';
  const secondPrice = document.getElementById('secondCoursePrice')?.value || '';
  const tableHTML = document.querySelector('#declarationTableContainer table')?.outerHTML || '';
  const html = tableHTML
    ? generateFullHTMLEmail(child.name, child.cls, getMonthYear(), firstPrice, secondPrice,
        getComboPriceValue(firstPrice, secondPrice), child.health, tableHTML)
    : null;
  saveDeclarationSnapshot({ method, to, html });
}

function describeDeclarationChoice(day) {
  if (day.noLunch) return 'Dzień bez obiadu';
  if (day.first && day.second) return 'Zupa i drugie danie';
  if (day.first) return 'Tylko zupa';
  if (day.second) return 'Tylko drugie danie';
  return 'Nic nie wybrano';
}

function declarationStatus(entry) {
  const last = entry.sends[entry.sends.length - 1];
  if (!last) return { text: 'Niewysłana', cls: 'is-draft' };
  const date = formatDateTime(last.at).slice(0, 5);
  if (last.method === 'pdf' || last.method === 'pdf-podpis') return { text: `PDF pobrany ${date}`, cls: 'is-sent' };
  if (last.method === 'kopia') return { text: `Tabela skopiowana ${date}`, cls: 'is-sent' };
  return { text: `Wysłana ${date}`, cls: 'is-sent' };
}

function describeCounts(counts, prices) {
  const parts = [];
  if (counts.combo) parts.push(`${formatDaysCount(counts.combo)} zupa i drugie danie po ${formatMoney(prices.combo)}`);
  if (counts.first) parts.push(`${formatDaysCount(counts.first)} tylko zupa po ${formatMoney(prices.first)}`);
  if (counts.second) parts.push(`${formatDaysCount(counts.second)} tylko drugie danie po ${formatMoney(prices.second)}`);
  return parts.length ? parts.join(', ') : 'Nie wybrano żadnego obiadu';
}

// Przyciski w liście obsługuje jeden nasłuch (klucz pozycji jest w data-key, bez wstawiania do kodu JS)
function initDeclarationArchive() {
  const list = document.getElementById('declarationArchiveList');
  if (!list) return;
  list.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    const key = button?.closest('details')?.dataset.key;
    if (!key) return;
    if (button.dataset.action === 'show') showArchivedDeclaration(key, Number(button.dataset.index));
    if (button.dataset.action === 'open') openArchivedMonth(key);
    if (button.dataset.action === 'delete') deleteArchivedDeclaration(key);
  });
  list.addEventListener('change', event => {
    const key = event.target.closest('details')?.dataset.key;
    if (key && event.target.dataset.action === 'paid') setDeclarationPaid(key, event.target.checked);
  });
  renderDeclarationArchive();
}

function renderDeclarationArchive() {
  const section = document.getElementById('declarationArchive');
  const list = document.getElementById('declarationArchiveList');
  if (!section || !list) return;
  const entries = loadDeclarations();
  const keys = Object.keys(entries).sort((a, b) => {
    const ea = entries[a];
    const eb = entries[b];
    return (eb.year * 100 + eb.month) - (ea.year * 100 + ea.month) || String(eb.updatedAt).localeCompare(String(ea.updatedAt));
  });

  section.classList.toggle('d-none', keys.length === 0);
  document.querySelector('.app-grid')?.classList.toggle('has-archive', keys.length > 0);
  list.innerHTML = keys.map(key => renderDeclarationEntry(key, entries[key])).join('');
  list.querySelectorAll('details').forEach(details => {
    details.addEventListener('toggle', () => {
      if (details.open) openDeclarationKeys.add(details.dataset.key);
      else openDeclarationKeys.delete(details.dataset.key);
    });
  });
}

function renderDeclarationEntry(key, entry) {
  const lastSend = entry.sends[entry.sends.length - 1] || null;
  // Pokazujemy to, co wysłano; bez wysyłki bieżący stan
  const shown = lastSend || entry;
  const status = declarationStatus(entry);
  const childLine = [entry.child.name, entry.child.cls && `klasa ${entry.child.cls}`].filter(Boolean).join(', ');
  const due = `10.${String(entry.month).padStart(2, '0')}.${entry.year}`;
  const changedAfterSend = lastSend && JSON.stringify(lastSend.days) !== JSON.stringify(entry.days);

  const sends = entry.sends.slice().reverse().map((send, i) => `
    <li>
      <span>${formatDateTime(send.at, true)} · ${escapeHtml(DECLARATION_SEND_LABELS[send.method] || send.method)}${send.to ? ` do ${escapeHtml(send.to)}` : ''} · ${formatMoney(send.total)}</span>
      ${send.html ? `<button type="button" class="btn btn-soft btn-sm" data-action="show" data-index="${entry.sends.length - 1 - i}">Pokaż</button>` : ''}
    </li>`).join('');

  const days = shown.days.map(day => {
    const names = [day.first && day.soup, day.second && day.main].filter(Boolean).map(escapeHtml).join(' · ');
    const weekday = getDayOfWeekPL(new Date(entry.year, entry.month - 1, parseInt(day.date, 10)).getDay(), true);
    const off = day.noLunch || (!day.first && !day.second);
    return `
      <li class="${off ? 'is-off' : ''}">
        <span class="archive-day-date">${escapeHtml(day.date)} <small>${weekday}</small></span>
        <span class="archive-day-choice">${describeDeclarationChoice(day)}${names ? `<small>${names}</small>` : ''}</span>
      </li>`;
  }).join('');

  return `
    <details class="archive-item" data-key="${escapeHtml(key)}" ${openDeclarationKeys.has(key) ? 'open' : ''}>
      <summary>
        <span class="archive-head">
          <strong>${DECLARATION_MONTHS[entry.month]} ${entry.year}</strong>
          ${childLine ? `<small>${escapeHtml(childLine)}</small>` : ''}
        </span>
        <span class="archive-total">${formatMoney(shown.total)}</span>
        <span class="archive-status ${status.cls}">${status.text}</span>
        ${entry.paidAt ? '<span class="archive-status is-paid">Zapłacona</span>' : ''}
      </summary>
      <div class="archive-body">
        <div class="archive-pay">
          <div>
            <span class="archive-label">Do zapłaty</span>
            <strong>${formatMoney(shown.total)}</strong>
            <small>${entry.paidAt ? `zapłacono ${formatDateTime(entry.paidAt)}` : `wpłata do ${due} w sekretariacie`}</small>
          </div>
          <label class="archive-paid">
            <input type="checkbox" class="form-check-input" data-action="paid" ${entry.paidAt ? 'checked' : ''}>
            Zapłacone
          </label>
        </div>
        <p class="archive-note">${describeCounts(shown.counts, entry.prices)}.</p>
        ${changedAfterSend ? `<p class="archive-note archive-warn">Po ostatnim wysłaniu wybór obiadów zmienił się (teraz ${formatMoney(entry.total)}). Poniżej jest wersja wysłana.</p>` : ''}

        <h4 class="archive-subtitle">${entry.sends.length ? 'Wysłano' : 'Jeszcze nie wysłano'}</h4>
        ${sends ? `<ul class="archive-sends">${sends}</ul>` : '<p class="archive-note">Deklaracja jest przygotowana, ale nie została wysłana ani pobrana.</p>'}

        <h4 class="archive-subtitle">Wybrane obiady</h4>
        <ul class="archive-days">${days}</ul>

        <div class="archive-actions">
          ${entry.menu ? '<button type="button" class="btn btn-soft btn-sm" data-action="open">Otwórz ten miesiąc w tabeli</button>' : ''}
          <button type="button" class="btn btn-link-muted btn-sm" data-action="delete">Usuń z tej przeglądarki</button>
        </div>
      </div>
    </details>`;
}

function setDeclarationPaid(key, paid) {
  const entries = loadDeclarations();
  if (!entries[key]) return;
  entries[key].paidAt = paid ? new Date().toISOString() : null;
  storeDeclarations(entries);
  renderDeclarationArchive();
}

function deleteArchivedDeclaration(key) {
  const entries = loadDeclarations();
  const entry = entries[key];
  if (!entry) return;
  const label = `${DECLARATION_MONTHS[entry.month].toLowerCase()} ${entry.year}${entry.child.name ? ` (${entry.child.name})` : ''}`;
  if (!confirm(`Usunąć zapisaną deklarację na ${label} z tej przeglądarki?`)) return;
  delete entries[key];
  openDeclarationKeys.delete(key);
  storeDeclarations(entries);
  renderDeclarationArchive();
}

// Wczytuje zapisany jadłospis miesiąca z wyborami i cenami z deklaracji
function openArchivedMonth(key) {
  const entry = loadDeclarations()[key];
  if (!entry || !entry.menu) return;
  parseMenu(entry.menu);
  const selections = {};
  entry.days.forEach(day => {
    if (!day.noLunch) selections[day.date] = { first: day.first, second: day.second };
  });
  applySelections(selections);
  saveSelections();
  [['firstCoursePrice', entry.prices.first], ['secondCoursePrice', entry.prices.second], ['comboPrice', entry.prices.combo]].forEach(([id, value]) => {
    const input = document.getElementById(id);
    if (input) {
      input.value = Number(value).toFixed(2);
      input.dispatchEvent(new Event('input'));
    }
  });
  document.querySelector('.area-menu')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  showSimpleToast(`Otwarto ${DECLARATION_MONTHS[entry.month].toLowerCase()} ${entry.year}`, 'success');
}

// Podgląd wysłanej deklaracji (tylko do odczytu, z możliwością skopiowania)
function showArchivedDeclaration(key, index) {
  const send = loadDeclarations()[key]?.sends[index];
  if (!send || !send.html) return;
  document.getElementById('archiveViewer')?.remove();
  const viewer = document.createElement('div');
  viewer.id = 'archiveViewer';
  viewer.className = 'archive-viewer';
  viewer.innerHTML = `
    <div class="archive-viewer-box" role="dialog" aria-modal="true" aria-label="Wysłana deklaracja">
      <div class="archive-viewer-head">
        <strong>Deklaracja z ${formatDateTime(send.at, true)}</strong>
        <div class="archive-viewer-buttons">
          <button type="button" class="btn btn-soft btn-sm" data-action="copy">Kopiuj</button>
          <button type="button" class="btn btn-primary btn-sm" data-action="close">Zamknij</button>
        </div>
      </div>
      <iframe sandbox title="Treść deklaracji"></iframe>
    </div>`;
  viewer.querySelector('iframe').srcdoc = send.html;
  viewer.addEventListener('click', event => {
    const action = event.target.dataset.action;
    if (action === 'close' || event.target === viewer) viewer.remove();
    if (action === 'copy') {
      copyRichHTMLToClipboard(send.html, ok => showSimpleToast(ok ? 'Deklaracja skopiowana' : 'Nie udało się skopiować', ok ? 'success' : 'error'));
    }
  });
  document.body.appendChild(viewer);
}

// ============================================
// CZĘŚĆ 17: UDOGODNIENIA
// ============================================
// Deklaracja aktualna razem z zaznaczeniami, szybki wybór dni tygodnia,
// opis dań z danego dnia (także na telefonie), wspólne okno dialogowe
// i kopia danych z tej przeglądarki do pliku.

let declarationMonthShown = null;   // miesiąc, dla którego wygenerowano tabelę deklaracji
let declarationRefreshTimer = null;
let dayInfoRow = null;              // wiersz dnia pokazany w oknie z opisem dań
const WEEKDAY_PLURALS = { 1: 'poniedziałki', 2: 'wtorki', 3: 'środy', 4: 'czwartki', 5: 'piątki' };
const WEEKDAY_FULL = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];
const BACKUP_APP_ID = 'obiady-deklaracja';

// -------------------------------------------------------
// Deklaracja zawsze zgodna z tym, co zaznaczono
// -------------------------------------------------------
// Po wygenerowaniu tabeli każda zmiana zaznaczeń albo cen odświeża ją
// (z opóźnieniem, żeby "Wszystkie zupy" nie przeliczało tabeli 20 razy).
// Przed wysłaniem, kopiowaniem i PDF czekające odświeżenie robimy od razu.

function scheduleDeclarationRefresh() {
  if (!declarationMonthShown) return;
  clearTimeout(declarationRefreshTimer);
  declarationRefreshTimer = setTimeout(refreshDeclarationNow, 250);
}

function refreshDeclarationNow() {
  clearTimeout(declarationRefreshTimer);
  declarationRefreshTimer = null;
  if (declarationMonthShown && declarationMonthShown === getMonthYear()) generateDeclaration();
}

function flushDeclarationRefresh() {
  if (declarationRefreshTimer) refreshDeclarationNow();
}

// Inny miesiąc w tabeli: deklaracja poprzedniego znika, żeby nie wysłać jej przez pomyłkę
function resetDeclarationIfOtherMonth() {
  if (!declarationMonthShown || declarationMonthShown === getMonthYear()) return;
  clearTimeout(declarationRefreshTimer);
  declarationRefreshTimer = null;
  declarationMonthShown = null;
  document.getElementById('declarationTableContainer').innerHTML = '';
  ['declarationActions', 'emailFormSection', 'pdfFormSection', 'declarationLiveNote'].forEach(id => {
    document.getElementById(id)?.classList.add('d-none');
  });
}

// Wywoływane po zbudowaniu tabeli jadłospisu (renderMenuCalendar)
function afterMenuRendered() {
  resetDeclarationIfOtherMonth();
  scheduleDeclarationRefresh();
  const period = getMenuPeriod();
  const badge = document.getElementById('menuMonthBadge');
  if (badge && period) {
    badge.textContent = `${DECLARATION_MONTHS[period.month]} ${period.year}`;
    badge.classList.remove('d-none');
  }
  document.getElementById('menuHint')?.classList.remove('d-none');
  closeAppDialog('dayInfo');
  updateWeekdayChips();
}

// -------------------------------------------------------
// Dni tygodnia jednym kliknięciem (np. w piątki bez obiadu)
// -------------------------------------------------------

// Pola wyboru dań z danego dnia tygodnia (tylko tam, gdzie danie jest w jadłospisie)
function weekdayBoxes(weekday) {
  const boxes = [];
  document.querySelectorAll('#menuTable tbody tr.has-info').forEach(row => {
    if (Number(row.dataset.wd) !== weekday) return;
    row.querySelectorAll('.dish-checkbox').forEach(box => {
      if (box.parentElement.previousElementSibling?.textContent.trim()) boxes.push(box);
    });
  });
  return boxes;
}

function updateWeekdayChips() {
  const bar = document.getElementById('weekdayBar');
  if (!bar) return;
  let anyDays = false;
  bar.querySelectorAll('.weekday-chip').forEach(chip => {
    const boxes = weekdayBoxes(Number(chip.dataset.wd));
    const checked = boxes.filter(box => box.checked).length;
    chip.disabled = boxes.length === 0;
    chip.classList.toggle('is-all', boxes.length > 0 && checked === boxes.length);
    chip.classList.toggle('is-none', boxes.length > 0 && checked === 0);
    chip.classList.toggle('is-partial', checked > 0 && checked < boxes.length);
    chip.setAttribute('aria-pressed', checked > 0 ? 'true' : 'false');
    if (boxes.length) anyDays = true;
  });
  bar.classList.toggle('d-none', !anyDays);
}

// Gdy w te dni coś jest zaznaczone, odznaczamy wszystko; gdy nic, zaznaczamy wszystko
function toggleWeekday(weekday) {
  const boxes = weekdayBoxes(weekday);
  if (!boxes.length) return;
  const select = boxes.every(box => !box.checked);
  boxes.forEach(box => {
    if (box.checked === select) return;
    box.checked = select;
    box.dispatchEvent(new Event('change'));
  });
  updateWeekdayChips();
  showSimpleToast(`${select ? 'Zaznaczono' : 'Odznaczono'} obiady we wszystkie ${WEEKDAY_PLURALS[weekday]}`, 'success');
}

// -------------------------------------------------------
// Wspólne okno dialogowe
// -------------------------------------------------------
// Przyciski z data-action trafiają do onAction; "close", tło i Escape zamykają.
// onAction zwraca true, gdy okno ma zostać otwarte (np. zmiana wyboru w oknie dnia).

function openAppDialog(id, html, onAction, options = {}) {
  let dialog = document.getElementById(id);
  if (!dialog) {
    dialog = document.createElement('div');
    dialog.id = id;
    dialog.className = 'app-dialog' + (options.sheet ? ' is-sheet' : '');
    dialog.innerHTML = '<div class="app-dialog-box" role="dialog" aria-modal="true"></div>';
    dialog.addEventListener('click', event => {
      const button = event.target.closest('[data-action]');
      if (event.target === dialog || button?.dataset.action === 'close') {
        closeAppDialog(id);
        return;
      }
      if (button && dialog._onAction) {
        const keepOpen = dialog._onAction(button.dataset.action);
        if (keepOpen !== true) closeAppDialog(id);
      }
    });
    document.body.appendChild(dialog);
  }
  dialog._onAction = onAction;
  dialog._onClose = options.onClose || null;
  const box = dialog.querySelector('.app-dialog-box');
  const hadFocus = dialog.contains(document.activeElement);
  box.innerHTML = html;
  box.setAttribute('aria-label', options.label || '');
  if (!hadFocus) box.querySelector('button')?.focus({ preventScroll: true });
  return dialog;
}

function closeAppDialog(id) {
  const dialog = document.getElementById(id);
  if (!dialog) return;
  dialog.remove();
  if (dialog._onClose) dialog._onClose();
}

// -------------------------------------------------------
// Opis dań z danego dnia (kliknięcie daty w tabeli)
// -------------------------------------------------------

function openDayInfo(row) {
  if (!row || !row.classList.contains('has-info')) return;
  dayInfoRow = row;
  renderDayInfo();
  const dishes = [row.cells[3], row.cells[5]]
    .filter(cell => cell.textContent.trim())
    .map(cell => ({ name: cell.textContent.trim(), kind: cell.classList.contains('cell-first-dish') ? 'zupa' : 'drugie' }));
  fetchDishDescriptions(dishes);
}

function dayInfoDishHtml(row, index) {
  const cell = row.cells[index === 0 ? 3 : 5];
  const box = row.querySelectorAll('.dish-checkbox')[index];
  const name = cell.textContent.trim();
  if (!name || !box) return '';
  const info = dishDescriptions.get(name);
  let description;
  if (!info) {
    description = '<p class="day-info-note">Wczytuję opis dania</p>';
  } else if (info.text) {
    description = `<p>${escapeHtml(info.text)}</p>` +
      (DISH_SOURCE_LABELS[info.source] ? `<small class="day-info-note">${DISH_SOURCE_LABELS[info.source]}</small>` : '');
  } else {
    description = '<p class="day-info-note">Brak opisu tego dania</p>';
  }
  const extras = [
    cell.dataset.deser && `🍰 Deser: ${escapeHtml(cell.dataset.deser)}`,
    cell.dataset.alergeny && `⚠️ Alergeny: ${escapeHtml(cell.dataset.alergeny)}`
  ].filter(Boolean).map(text => `<small>${text}</small>`).join('');
  return `
    <section class="day-info-dish ${index === 0 ? 'is-soup' : 'is-main'}">
      <span class="day-info-kind">${index === 0 ? 'Zupa' : 'Drugie danie'}</span>
      <strong>${escapeHtml(name)}</strong>
      ${description}
      ${extras}
      <button type="button" class="day-info-toggle ${box.checked ? 'is-on' : ''}" data-action="toggle-${index}" aria-pressed="${box.checked}">
        ${box.checked ? 'Zamówione' : 'Nie zamawiam'}
      </button>
    </section>`;
}

function renderDayInfo() {
  const row = dayInfoRow;
  if (!row || !row.isConnected) return;
  const html = `
    <div class="app-dialog-head">
      <h3 class="app-dialog-title">${WEEKDAY_FULL[Number(row.dataset.wd)] || ''}, ${escapeHtml(row.cells[1].textContent.trim())}</h3>
      <button type="button" class="btn btn-primary btn-sm" data-action="close">Zamknij</button>
    </div>
    ${dayInfoDishHtml(row, 0)}
    ${dayInfoDishHtml(row, 1)}`;
  openAppDialog('dayInfo', html, action => {
    const index = action === 'toggle-0' ? 0 : action === 'toggle-1' ? 1 : -1;
    const box = index >= 0 ? row.querySelectorAll('.dish-checkbox')[index] : null;
    if (box) {
      box.checked = !box.checked;
      box.dispatchEvent(new Event('change'));
      renderDayInfo();
    }
    return true;
  }, { sheet: true, label: 'Opis dań z wybranego dnia', onClose: () => { dayInfoRow = null; } });
}

function refreshDayInfo() {
  if (dayInfoRow && document.getElementById('dayInfo')) renderDayInfo();
}

// -------------------------------------------------------
// Kopia danych z tej przeglądarki (plik na telefonie lub komputerze)
// -------------------------------------------------------
// Dane są tylko w localStorage, więc giną przy czyszczeniu przeglądarki
// albo zmianie telefonu. Kopia to zwykły plik JSON, który zostaje u rodzica;
// wczytanie dopisuje brakujące dane i niczego nie kasuje.

function isBackupKey(key) {
  return key === DECLARATIONS_KEY || key.startsWith(STORAGE_KEYS.selectionsPrefix) ||
    [STORAGE_KEYS.childName, STORAGE_KEYS.childClass, STORAGE_KEYS.healthNotes, STORAGE_KEYS.signature].includes(key);
}

function exportLocalData() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (isBackupKey(key)) data[key] = localStorage.getItem(key);
  }
  const declarations = Object.keys(loadDeclarations()).length;
  const months = Object.keys(data).filter(key => key.startsWith(STORAGE_KEYS.selectionsPrefix)).length;
  if (!declarations && !months) {
    showSimpleToast('Na tym urządzeniu nie ma jeszcze zapisanych wyborów ani deklaracji', 'info');
    return;
  }
  const now = new Date();
  const stamp = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
  const file = JSON.stringify({ app: BACKUP_APP_ID, version: 1, exportedAt: now.toISOString(), data });
  downloadBlob(new Blob([file], { type: 'application/json' }), `obiady-kopia-${stamp}.json`);
  showSimpleToast(`Zapisano kopię: ${describeBackup(declarations, months)}`, 'success');
}

function describeBackup(declarations, months) {
  return `${declarations} ${polishPlural(declarations, 'deklaracja', 'deklaracje', 'deklaracji')}, ` +
    `${months} ${polishPlural(months, 'miesiąc', 'miesiące', 'miesięcy')} z wyborami`;
}

// Pozycja "Moje deklaracje" z pliku: tylko poprawne dane (liczby jako liczby)
function cleanImportedDeclaration(entry) {
  if (!entry || typeof entry !== 'object' || !Array.isArray(entry.sends) || !Array.isArray(entry.days)) return null;
  const month = Number(entry.month);
  const year = Number(entry.year);
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 2100) return null;
  const numbers = obj => Object.fromEntries(Object.entries(obj && typeof obj === 'object' ? obj : {}).map(([k, v]) => [k, Number(v) || 0]));
  return Object.assign({}, entry, {
    month,
    year,
    child: entry.child && typeof entry.child === 'object' ? entry.child : { name: '', cls: '', health: 'brak' },
    prices: numbers(entry.prices),
    counts: numbers(entry.counts),
    total: Number(entry.total) || 0,
    sends: entry.sends.filter(send => send && typeof send === 'object' && Array.isArray(send.days))
      .map(send => Object.assign({}, send, { total: Number(send.total) || 0, counts: numbers(send.counts) }))
  });
}

async function importLocalData(file) {
  let backup = null;
  try {
    backup = JSON.parse(await file.text());
  } catch (error) {
    backup = null;
  }
  if (!backup || backup.app !== BACKUP_APP_ID || !backup.data || typeof backup.data !== 'object') {
    showSimpleToast('To nie jest plik z kopią danych z tej strony', 'error');
    return;
  }

  let declarations = 0;
  let months = 0;
  Object.entries(backup.data).forEach(([key, value]) => {
    if (typeof value !== 'string' || !isBackupKey(key)) return;
    if (key === DECLARATIONS_KEY) {
      let imported = {};
      try {
        imported = JSON.parse(value).entries || {};
      } catch (error) {
        imported = {};
      }
      const entries = loadDeclarations();
      Object.entries(imported).forEach(([entryKey, raw]) => {
        const entry = cleanImportedDeclaration(raw);
        if (!entry) return;
        // Ta sama deklaracja na obu urządzeniach: zostaje nowsza
        if (!entries[entryKey] || String(entry.updatedAt) > String(entries[entryKey].updatedAt)) {
          entries[entryKey] = entry;
          declarations++;
        }
      });
      storeDeclarations(entries);
    } else if (key.startsWith(STORAGE_KEYS.selectionsPrefix)) {
      // Wybory zrobione już na tym urządzeniu mają pierwszeństwo
      if (localStorage.getItem(key) === null) {
        localStorage.setItem(key, value);
        months++;
      }
    } else if (!localStorage.getItem(key) || (key === STORAGE_KEYS.healthNotes && localStorage.getItem(key) === 'brak')) {
      localStorage.setItem(key, value);
    }
  });

  loadSavedData();
  renderDeclarationArchive();
  const monthYear = getMonthYear();
  if (monthYear) applySelections(loadSelections(monthYear));
  showSimpleToast(declarations || months
    ? `Wczytano z kopii: ${describeBackup(declarations, months)}`
    : 'Wszystko z tej kopii jest już na tym urządzeniu', 'success');
}

function initComfortFeatures() {
  // Zmiany zaznaczeń (także wywołane z kodu, bez bąbelkowania) łapiemy w fazie przechwytywania
  document.getElementById('menuTable')?.addEventListener('change', event => {
    if (!event.target.classList || !event.target.classList.contains('dish-checkbox')) return;
    scheduleDeclarationRefresh();
    updateWeekdayChips();
  }, true);
  ['firstCoursePrice', 'secondCoursePrice', 'comboPrice'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', scheduleDeclarationRefresh);
  });
  document.getElementById('weekdayBar')?.addEventListener('click', event => {
    const chip = event.target.closest('.weekday-chip');
    if (chip && !chip.disabled) toggleWeekday(Number(chip.dataset.wd));
  });
  document.getElementById('exportDataBtn')?.addEventListener('click', exportLocalData);
  const importInput = document.getElementById('importDataInput');
  importInput?.addEventListener('change', () => {
    const file = importInput.files[0];
    if (file) importLocalData(file).finally(() => { importInput.value = ''; });
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') document.querySelectorAll('.app-dialog').forEach(dialog => closeAppDialog(dialog.id));
  });
}

// ============================================
// INICJALIZACJA - Czeka na załadowanie DOM
// ============================================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 DOM załadowany - inicjalizacja...');
    loadHistory();
    loadSavedData(); // DODAJ TĘ LINIĘ
    initDeclarationArchive();
    initComfortFeatures();
    attachFormListeners(); // DODAJ TĘ LINIĘ
    console.log('✅ Aplikacja gotowa!');
  });
} else {
  console.log('🚀 DOM już załadowany - inicjalizacja...');
  loadHistory();
  loadSavedData(); // DODAJ TĘ LINIĘ
  initDeclarationArchive();
  initComfortFeatures();
  attachFormListeners(); // DODAJ TĘ LINIĘ
  console.log('✅ Aplikacja gotowa!');
}

console.log('✅ Script.js załadowany - wersja uproszczona (bez modali)');