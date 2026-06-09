/*
    WACOM STU‑430 WebHID Driver - Versione Minimal
    -----------------------------------------------
    Questo file contiene un driver minimal per la STU‑430, pensato per applicazioni
    di firma. Non vengono letti feature report (come "capability", "information", "eSerial")
    perché la STU‑430 non li espone; vengono invece impostati valori fissi.

    Funzioni supportate:
      - connect()            : Effettua la connessione al dispositivo
      - checkConnected()     : Verifica se il dispositivo è connesso
      - setWritingArea()     : Imposta l’area di scrittura (es. 320x200)
      - setPenColorAndWidth() : Imposta il colore e lo spessore della penna (forza il nero)
      - setInking()          : Abilita/disabilita l’inking
      - clearScreen()        : Invia il comando per pulire lo schermo del tablet
      - onPenData(callback)  : Registra un callback per i dati della penna
      - (Opzionale) setImage() : Invia un’immagine (non utilizzata nella app firma)
      
    Inoltre gestisce gli eventi di connessione/disconnessione via WebHID.
    
    Autore: Gabriele Lagana'
    Data: 04/01/2025
*/

var wacomstu430 = function () {
  // Verifica se il browser supporta WebHID
  if (!navigator.hid) {
    console.error("WebHID non è supportato in questo browser.");
    return null;
  }

  // Configurazione fissa per STU‑430
  this.config = {
    chunkSize: 253,
    vid: 1386,                       // Wacom Vendor ID
    pid: 164,                        // STU‑430 Product ID
    imageFormatMonochromeBulk: 0x10, // Modalità bulk per immagine 1‑bit
    width: 320,
    height: 200,
    scaleFactor: 1,
    pressureFactor: 1023,
    tabletWidth: 320,
    tabletHeight: 200,
    refreshRate: 0,
    deviceName: "STU‑430",
    firmware: "0.0.0.0",
    eSerial: "N/A",
    lumaThreshold: 127,              // Soglia per conversione in 1‑bit (se usata)
    onPenDataCb: null,
    onHidChangeCb: null
  };

  // Definizione dei report IDs necessari
  this.command = {
    penData: 0x01,
    writingMode: 0x0E,
    clearScreen: 0x20,
    inkMode: 0x21,
    writeImageStart: 0x25,
    writeImageData: 0x26,
    writeImageEnd: 0x27,
    writingArea: 0x2A,
    brightness: 0x2B,
    backgroundColor: 0x2E,
    penColorAndWidth: 0x2D,
    penDataTiming: 0x34
  };

  // Dispositivo HID interno e immagine (se necessario)
  this.device = null;
  this.image = null;

  // Helper: verifica se il dispositivo è connesso
  this.checkConnected = function () {
    return this.device && this.device.opened;
  }.bind(this);

  // Connessione: richiede il dispositivo e lo apre; imposta valori fissi
  this.connect = async function () {
    if (this.checkConnected()) return true;
    let devices = await navigator.hid.requestDevice({
      filters: [{ vendorId: this.config.vid, productId: this.config.pid }]
    });
    if (!devices || devices.length === 0) return false;
    this.device = devices[0];
    await this.device.open();

    // Imposta valori fissi per STU‑430
    this.config.tabletWidth = 320;
    this.config.tabletHeight = 200;
    this.config.pressureFactor = 1023;
    this.config.width = 320;
    this.config.height = 200;
    this.config.refreshRate = 0;
    this.config.scaleFactor = 1;

    // Imposta il listener per i report della penna
    this.device.addEventListener("inputreport", function (event) {
      if (!this.config.onPenDataCb) return;
      if (event.reportId === this.command.penData || event.reportId === this.command.penDataTiming) {
        let data = event.data;
        let packet = {
          // Il primo byte contiene lo stato; la pressione viene calcolata usando gli stessi byte
          rdy: (data.getUint8(0) & 1) !== 0,
          sw: (data.getUint8(0) & 2) !== 0,
          // Le coordinate vengono lette come Uint16 e scalate (qui scaleFactor=1)
          cx: Math.trunc(data.getUint16(2) / this.config.scaleFactor),
          cy: Math.trunc(data.getUint16(4) / this.config.scaleFactor),
          x: data.getUint16(2),
          y: data.getUint16(4),
          press: data.getUint16(0) / this.config.pressureFactor,
          seq: null,
          time: null
        };
        if (event.reportId === this.command.penDataTiming) {
          packet.time = data.getUint16(6);
          packet.seq = data.getUint16(8);
        }
        this.config.onPenDataCb(packet);
      }
    }.bind(this));
    return true;
  }.bind(this);

  // Invia dati al dispositivo tramite sendFeatureReport
  this.sendData = async function (reportId, data) {
    if (!this.checkConnected()) return;
    await this.device.sendFeatureReport(reportId, data);
  }.bind(this);

  // Crea un pacchetto di byte con DataView (per costruire i comandi)
  this.makePacket = function (len) {
    let p = new Uint8Array(len);
    return { data: p, view: new DataView(p.buffer) };
  };

  // Divide un array in chunk della dimensione specificata
  this.splitToBulks = function (arr, bulkSize) {
    let bulks = [];
    for (let i = 0; i < Math.ceil(arr.length / bulkSize); i++) {
      let start = i * bulkSize;
      let end = Math.min((i + 1) * bulkSize, arr.length);
      bulks.push(arr.slice(start, end));
    }
    return bulks;
  };

  // Imposta il colore e lo spessore della penna (per STU‑430 forziamo il nero)
  this.setPenColorAndWidth = async function (color, width) {
    if (!this.checkConnected()) return;
    let c = [0, 0, 0]; // Ignora il parametro color: usa il nero
    c.push(parseInt(width));
    await this.sendData(this.command.penColorAndWidth, new Uint8Array(c));
  }.bind(this);

  // (Opzionale) Imposta il backlight; per la STU‑430 potrebbe non essere necessario
  this.setBacklight = async function (intensity) {
    if (!this.checkConnected()) return;
    await this.sendData(this.command.brightness, new Uint8Array([intensity, 0]));
  }.bind(this);

  // Imposta il colore di sfondo
  this.setBackgroundColor = async function (color) {
    if (!this.checkConnected()) return;
    let c = color.replace('#', '').match(/.{1,2}/g).map(e => parseInt(e, 16));
    await this.sendData(this.command.backgroundColor, new Uint8Array(c));
  }.bind(this);

  // Imposta l'area di scrittura
  this.setWritingArea = async function (p) {
    if (!this.checkConnected()) return;
    let pk = this.makePacket(8);
    pk.view.setUint16(0, p.x1, true);
    pk.view.setUint16(2, p.y1, true);
    pk.view.setUint16(4, p.x2, true);
    pk.view.setUint16(6, p.y2, true);
    await this.sendData(this.command.writingArea, pk.data);
  }.bind(this);

  // Imposta la modalità di scrittura (0 o 1)
  this.setWritingMode = async function (mode) {
    if (!this.checkConnected()) return;
    await this.sendData(this.command.writingMode, new Uint8Array([mode]));
  }.bind(this);

  // Abilita o disabilita l'inking
  this.setInking = async function (enabled) {
    if (!this.checkConnected()) return;
    await this.sendData(this.command.inkMode, new Uint8Array([enabled ? 1 : 0]));
  }.bind(this);

  // Cancella lo schermo del tablet
  this.clearScreen = async function () {
    if (!this.checkConnected()) return;
    await this.sendData(this.command.clearScreen, new Uint8Array([0]));
  }.bind(this);

  // (Opzionale) Invia un'immagine al dispositivo; non usata nella semplice app firma
  this.setImage = async function (imageData) {
    if (!this.checkConnected()) return;
    if (imageData != null) {
      this.image = this.splitToBulks(imageData, this.config.chunkSize);
    }
    if (this.image == null) return;
    await this.sendData(this.command.writeImageStart, new Uint8Array([this.config.imageFormatMonochromeBulk]));
    for (let chunk of this.image) {
      let payload = new Uint8Array(2 + chunk.length);
      payload[0] = chunk.length;
      payload[1] = 0;
      payload.set(chunk, 2);
      await this.sendData(this.command.writeImageData, payload);
    }
    await this.sendData(this.command.writeImageEnd, new Uint8Array([0]));
  }.bind(this);

  // Registra il callback per i dati della penna
  this.onPenData = function (callback) {
    this.config.onPenDataCb = callback;
  }.bind(this);

  // Registra il callback per eventi di connessione/disconnessione
  this.onHidChange = function (callback) {
    this.config.onHidChangeCb = callback;
  }.bind(this);

  // Gestione degli eventi di connessione/disconnessione tramite WebHID
  navigator.hid.addEventListener("connect", function (e) {
    if (this.config.onHidChangeCb &&
        e.device.vendorId === this.config.vid &&
        e.device.productId === this.config.pid) {
      this.config.onHidChangeCb("connect", e.device);
    }
  }.bind(this));

  navigator.hid.addEventListener("disconnect", function (e) {
    if (this.config.onHidChangeCb &&
        e.device.vendorId === this.config.vid &&
        e.device.productId === this.config.pid) {
      this.config.onHidChangeCb("disconnect", e.device);
    }
  }.bind(this));

  return this;
};
