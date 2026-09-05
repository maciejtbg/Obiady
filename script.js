// ============================================
// GENERATOR DEKLARACJI OBIADOWEJ - UPROSZCZONY
// Bez zbędnych modali, prostsza nawigacja
// ============================================

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

const savedTheme = localStorage.getItem('theme') || 'light';
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

function loadHistory() {
  fetch('get_history.php?limit=1')
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
      } else {
        historySection.classList.add('d-none');
        if (toggleDebugCheckbox.checked && data.error) {
          debugBox.innerHTML = '⚠️ Historia: ' + data.error;
          debugBox.classList.remove('d-none');
        }
      }
    })
    .catch(error => {
      historySection.classList.add('d-none');
      if (toggleDebugCheckbox.checked) {
        console.warn('Historia niedostępna:', error);
      }
    });
}

function loadMoreHistory() {
  expandHistoryBtn.disabled = true;
  expandHistoryBtn.textContent = 'Ładowanie...';
  
  fetch('get_history.php?limit=20')
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
        expandHistoryBtn.textContent = 'Pokaż więcej...';
        expandHistoryBtn.disabled = false;
      }
    })
    .catch(error => {
      console.error('Błąd ładowania historii:', error);
      alert('❌ Nie udało się załadować historii');
      expandHistoryBtn.textContent = 'Pokaż więcej...';
      expandHistoryBtn.disabled = false;
    });
}

function renderHistory() {
  if (historyData.length === 0) {
    historySection.classList.add('d-none');
    return;
  }

  historySection.classList.remove('d-none');
  
  historyList.innerHTML = historyData.map(item => {
    let preview = '';
    try {
      const parsed = JSON.parse(item.converted_text);
      if (parsed.TextResult) {
        const firstLine = parsed.TextResult.split('\n')[0];
        preview = firstLine.length > 30 ? firstLine.substring(0, 30) + '...' : firstLine;
      }
    } catch (e) {
      preview = 'Menu';
    }
    
    return `
      <div class="history-item" onclick="loadFromHistory(${item.id})">
        <strong>${item.filename}</strong>
        <small>${item.upload_date}</small>
        ${preview ? `<small style="color: #999; font-style: italic;">${preview}</small>` : ''}
      </div>
    `;
  }).join('');

  if (!allHistoryLoaded && historyData.length === 1) {
    expandHistoryBtn.classList.remove('d-none');
    expandHistoryBtn.textContent = 'Pokaż więcej...';
    expandHistoryBtn.disabled = false;
  } else if (allHistoryLoaded && historyData.length > 1) {
    expandHistoryBtn.classList.remove('d-none');
    expandHistoryBtn.textContent = 'Pokaż mniej...';
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
  if (item) {
    const textData = item.converted_text;
    
    if (toggleDebugCheckbox.checked) {
      debugBox.innerHTML = `📂 Wczytano z historii: ${item.filename}<br>ID: ${item.id}`;
      debugBox.classList.remove('d-none');
    }
    
    convertedTextarea.value = textData;
    parseMenu(textData);
  }
};

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

function showDuplicateModal(fileData, onConfirm) {
  const timeDiff = getTimeAgo(fileData.upload_date);
  
  const modalHtml = `
    <div id="duplicateModal" style="
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
    ">
      <div style="
        background: white;
        padding: 30px;
        border-radius: 10px;
        max-width: 500px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      ">
        <h4 style="margin-top: 0; color: #e67e22;">⚠️ Plik już istnieje</h4>
        <p>Plik o nazwie <strong>"${fileData.filename}"</strong> został już załadowany.</p>
        <p style="color: #666;">
          <strong>Data uploadu:</strong> ${fileData.upload_date}<br>
          <strong>Wgrany:</strong> ${timeDiff}
        </p>
        <p>Czy na pewno chcesz załadować ten plik ponownie?</p>
        <div style="margin-top: 20px; text-align: right;">
          <button onclick="closeDuplicateModal()" style="
            padding: 10px 20px;
            margin-right: 10px;
            border: 1px solid #ccc;
            background: white;
            border-radius: 5px;
            cursor: pointer;
          ">Anuluj</button>
          <button onclick="confirmDuplicateUpload()" style="
            padding: 10px 20px;
            background: #3498db;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
          ">Tak, wgraj ponownie</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  window._duplicateUploadCallback = onConfirm;
}

function getTimeAgo(dateString) {
  const uploadDate = new Date(dateString.replace(' ', 'T'));
  const now = new Date();
  const diffMs = now - uploadDate;
  
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 60) {
    return diffMins === 1 ? '1 minutę temu' : `${diffMins} minut temu`;
  } else if (diffHours < 24) {
    return diffHours === 1 ? '1 godzinę temu' : `${diffHours} godzin temu`;
  } else if (diffDays === 1) {
    return '1 dzień temu';
  } else if (diffDays < 30) {
    return `${diffDays} dni temu`;
  } else {
    return dateString;
  }
}

window.closeDuplicateModal = function() {
  const modal = document.getElementById('duplicateModal');
  if (modal) modal.remove();
  window._duplicateUploadCallback = null;
};

window.confirmDuplicateUpload = function() {
  if (window._duplicateUploadCallback) {
    window._duplicateUploadCallback();
  }
  closeDuplicateModal();
};

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
        }
        document.getElementById('warningBox').classList.remove('d-none');
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
// Nowa ścieżka: jadłospis rozpoznany bezpośrednio z tabel w pliku .docx
// (dane.Format === 'table', patrz convert.php -> parseMenuDocxTables).
// Dużo prostsza i pewniejsza niż parsowanie linii tekstu, bo granice
// "zupa / drugie danie / deser / alergeny" są już znane z komórek tabeli.
// -------------------------------------------------------------------
function parseMenuFromTableData(dane, ctx) {
  const { debugEnabled, debugBox, menuTableBody } = ctx;

  try {
    menuTableBody.innerHTML = '';

    const parsedDates = {};
    let monthNumber = 0;
    let monthName = '';

    dane.Days.forEach(d => {
      const parts = String(d.date || '').split('.');
      if (parts.length !== 2) return;
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      const dateKey = `${day}.${month}`;
      monthNumber = parseInt(month, 10) || monthNumber;
      monthName = getMonthName(monthNumber) || monthName;

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

    // Przywróć zapisane wybory użytkownika (jeśli istnieją dla tego miesiąca)
    const monthYear = getMonthYear();
    const savedSelections = loadSelections(monthYear);
    if (savedSelections) {
      applySelections(savedSelections);
      console.log(`✅ Przywrócono wybory dla ${monthYear}`);
    }

attachSummaryListeners();
    attachTooltipListeners();
    attachSelectAllListeners(); // DODAJ TĘ LINIĘ
// Inicjalizuj stan przycisków mobilnych
  if (window.innerWidth <= 768) {
    updateMobileButtonState('first');
    updateMobileButtonState('second');
  }
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

async function attachTooltipListeners() {
  if (window.innerWidth <= 768) {
    return;
  }
  
  const debugEnabled = toggleDebugCheckbox.checked;
  const debugLog = [];
  const elements = document.querySelectorAll('.dish-name');

  for (const el of elements) {
    const dishText = el.textContent.trim();
    const dishLower = dishText.toLowerCase();
    let definition = null;

    // 1. Sprawdź polishDefinitions (pełna nazwa)
    if (polishDefinitions && polishDefinitions[dishLower]) {
      definition = polishDefinitions[dishLower];
    }

    // 2. Sprawdź keywordDefinitions (słowa kluczowe)
    if (!definition) {
      for (const keyword in keywordDefinitions) {
        if (dishLower.includes(keyword)) {
          definition = keywordDefinitions[keyword];
          break;
        }
      }
    }

    // 3. Jeśli brak - pobierz z Wikipedia i AUTOMATYCZNIE dodaj do pliku
    if (!definition) {
      if (debugEnabled) {
        debugLog.push(`🔍 Pobieram definicję dla: <strong>${dishText}</strong>`);
      }
      
      definition = await fetchAndAddDefinition(dishText, debugEnabled, debugLog);
    }

    // Utwórz tooltip
    let tippyContent = definition || 'Definicja niedostępna';
    if (el.dataset.deser) {
      tippyContent += `<br><small>🍰 Deser: ${el.dataset.deser}</small>`;
    }
    if (el.dataset.alergeny) {
      tippyContent += `<br><small>⚠️ Alergeny: ${el.dataset.alergeny}</small>`;
    }
    tippy(el, {
      content: tippyContent,
      allowHTML: true,
      theme: localStorage.getItem('theme') === 'dark' ? 'dark' : 'light',
      placement: 'top',
    });
  }

  if (debugEnabled && debugLog.length > 0) {
    debugBox.innerHTML += '<br><br><strong>📚 Status definicji:</strong><br>' + debugLog.join('<br>');
  }
}

// Funkcja pobierająca i automatycznie dodająca definicję
async function fetchAndAddDefinition(dishName, debugEnabled, debugLog) {
  try {
    // Pobierz z Wikipedia
    const definition = await fetchSmartDefinitionFromWikipedia(dishName);
    
    if (definition && definition !== 'Definicja niedostępna') {
      // AUTOMATYCZNIE dodaj do definitions.js
      const saved = await addDefinitionToFile(dishName, definition);
      
      if (saved) {
        // Dodaj też do pamięci, żeby od razu działało
        if (typeof polishDefinitions !== 'undefined') {
          polishDefinitions[dishName.toLowerCase()] = definition;
        }
        
        if (debugEnabled) {
          debugLog.push(`✅ Dodano do definitions.js: <strong>${dishName}</strong>`);
          debugLog.push(`   └─ "${definition}"`);
        }
      }
      
      return definition;
    } else {
      if (debugEnabled) {
        debugLog.push(`❌ Nie znaleziono w Wikipedia: <strong>${dishName}</strong>`);
      }
      return 'Definicja niedostępna';
    }
    
  } catch (error) {
    console.error('Błąd pobierania definicji:', error);
    return 'Definicja niedostępna';
  }
}

// Funkcja automatycznie dodająca definicję do pliku
async function addDefinitionToFile(dishName, definition) {
  try {
    const response = await fetch('add_definition.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dish: dishName,
        definition: definition
      })
    });
    
    const data = await response.json();
    return data.success;
    
  } catch (error) {
    console.error('Błąd zapisu definicji:', error);
    return false;
  }
}

// Funkcja pobierająca NAJWAŻNIEJSZE zdanie z Wikipedia
async function fetchSmartDefinitionFromWikipedia(dishName) {
  try {
    // Próba 1: Pełna nazwa
    let url = `https://pl.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(dishName)}`;
    let response = await fetch(url);
    
    // Próba 2: Pierwsze słowo (np. "Żurek" zamiast "Żurek staropolski")
    if (!response.ok) {
      const firstWord = dishName.split(/\s+/)[0];
      url = `https://pl.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(firstWord)}`;
      response = await fetch(url);
    }
    
    if (!response.ok) {
      return 'Definicja niedostępna';
    }
    
    const data = await response.json();
    
    if (!data.extract) {
      return 'Definicja niedostępna';
    }
    
    // EKSTRAKCJA NAJWAŻNIEJSZEGO ZDANIA
    let extract = data.extract;
    
    // Usuń zbędne frazy na początku
    extract = extract.replace(/^(To |Jest to |W kuchni polskiej |Tradycyjne |Klasyczne )/i, '');
    
    // Weź pierwsze zdanie (do pierwszej kropki + spacja)
    let firstSentence = extract.split(/\.\s+/)[0];
    
    // Jeśli za długie (>150 znaków), skróć do ostatniego przecinka przed 150
    if (firstSentence.length > 150) {
      const cutPoint = firstSentence.lastIndexOf(',', 147);
      if (cutPoint > 80) { // Tylko jeśli ma sens (nie za krótko)
        firstSentence = firstSentence.substring(0, cutPoint);
      } else {
        firstSentence = firstSentence.substring(0, 147) + '...';
      }
    }
    
    // Dodaj kropkę na końcu jeśli brak
    if (!firstSentence.endsWith('.') && !firstSentence.endsWith('...')) {
      firstSentence += '.';
    }
    
    return firstSentence;
    
  } catch (error) {
    console.error('Błąd pobierania z Wikipedia:', error);
    return 'Definicja niedostępna';
  }
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
}

// ============================================
// CZĘŚĆ 8: KOPIOWANIE TABELI
// ============================================

function copyDeclarationTable() {
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
  const emailTo = document.getElementById('emailTo').value;
  const childName = document.getElementById('childName').value || 'Dziecko';
  const monthYear = getMonthYear();
  const subject = `Deklaracja obiadowa - ${childName} - ${monthYear}`;
  const htmlContent = generateEmailHTML();
  showEmailPreviewPanel(htmlContent, emailTo, subject, 'gmail');
}

function sendViaOutlook() {
  const emailTo = document.getElementById('emailTo').value;
  const childName = document.getElementById('childName').value || 'Dziecko';
  const subject = `Deklaracja obiadowa - ${childName} - ${getMonthYear()}`;
  const htmlContent = generateEmailHTML();
  showEmailPreviewPanel(htmlContent, emailTo, subject, 'outlook');
}

function sendViaLocalClient() {
  const emailTo = document.getElementById('emailTo').value;
  const childName = document.getElementById('childName').value || 'Dziecko';
  const subject = `Deklaracja obiadowa - ${childName} - ${getMonthYear()}`;
  const htmlContent = generateEmailHTML();
  showEmailPreviewPanel(htmlContent, emailTo, subject, 'local');
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
  
  // Nazwy miesięcy w MIANOWNIKU (nieodmienione)
  const monthNames = ['', 'STYCZEŃ', 'LUTY', 'MARZEC', 'KWIECIEŃ', 'MAJ', 'CZERWIEC', 
                      'LIPIEC', 'SIERPIEŃ', 'WRZESIEŃ', 'PAŹDZIERNIK', 'LISTOPAD', 'GRUDZIEŃ'];
  
  return `${monthNames[month]} ${targetYear}`;
}

function getSchoolYear() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
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
    
  } catch (error) {
    console.error('Błąd generowania PDF:', error);
    showSimpleToast('❌ Błąd podczas generowania PDF', 'error');
  }
}

async function generatePDFWithSignature() {
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

function startDrawing(e) {
  isDrawing = true;
  const rect = signatureCanvas.getBoundingClientRect();
  signatureCtx.beginPath();
  signatureCtx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
}

function draw(e) {
  if (!isDrawing) return;
  
  const rect = signatureCanvas.getBoundingClientRect();
  signatureCtx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
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
  const rect = signatureCanvas.getBoundingClientRect();
  isDrawing = true;
  signatureCtx.beginPath();
  signatureCtx.moveTo(touch.clientX - rect.left, touch.clientY - rect.top);
}

function handleTouchMove(e) {
  e.preventDefault();
  if (!isDrawing) return;
  
  const touch = e.touches[0];
  const rect = signatureCanvas.getBoundingClientRect();
  signatureCtx.lineTo(touch.clientX - rect.left, touch.clientY - rect.top);
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

function showSimpleToast(message, type = 'info') {
  const colors = {
    success: '#28a745',
    info: '#17a2b8',
    warning: '#ffc107',
    error: '#dc3545'
  };
  
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    top: 80px;
    right: 20px;
    background: ${colors[type]};
    color: white;
    padding: 15px 25px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
    animation: slideIn 0.3s ease-out;
    max-width: 400px;
  `;
  toast.textContent = message;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease-in';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Animacje CSS dla toastów
if (!document.getElementById('toastAnimations')) {
  const style = document.createElement('style');
  style.id = 'toastAnimations';
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    
    @keyframes slideOut {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(400px);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
}

// ============================================
// CZĘŚĆ 13: FUNKCJA TWORZENIA PDF (jsPDF)
// ============================================

async function createPDFDocument(childName, childClass, monthYear, firstPrice, secondPrice, totalPrice, healthNotes, table, signatureImage) {
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
          const year = new Date().getFullYear();
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
// INICJALIZACJA - Czeka na załadowanie DOM
// ============================================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 DOM załadowany - inicjalizacja...');
    loadHistory();
    loadSavedData(); // DODAJ TĘ LINIĘ
    attachFormListeners(); // DODAJ TĘ LINIĘ
    console.log('✅ Aplikacja gotowa!');
  });
} else {
  console.log('🚀 DOM już załadowany - inicjalizacja...');
  loadHistory();
  loadSavedData(); // DODAJ TĘ LINIĘ
  attachFormListeners(); // DODAJ TĘ LINIĘ
  console.log('✅ Aplikacja gotowa!');
}

console.log('✅ Script.js załadowany - wersja uproszczona (bez modali)');