(function () {
  "use strict";

  const DB_NAME = "PocketSathiDB";
  const DB_VERSION = 3;
  const BUDGET_CYCLE_DAYS = 30;
  const STORES = ["expenses", "credits", "reminders", "analytics"];
  const CATEGORY_KEYWORDS = {
    Food: ["food", "tea", "coffee", "lunch", "dinner", "breakfast", "snack", "milk", "grocery", "pizza", "momo", "chai", "khana", "சாப்பாடு"],
    Transport: ["petrol", "fuel", "bus", "train", "taxi", "auto", "rickshaw", "uber", "ola", "metro", "bus"],
    Shopping: ["shop", "shopping", "clothes", "mobile", "purchase", "buy", "shoes", "dress"],
    Utilities: ["electricity", "water", "gas", "internet", "recharge", "bill", "rent", "hostel"],
    Health: ["medicine", "doctor", "hospital", "health", "pharmacy"],
    Education: ["school", "college", "book", "course", "fees", "tuition", "class"],
    Entertainment: ["movie", "game", "party", "music", "show", "netflix", "spotify"],
    Other: []
  };

  Object.assign(CATEGORY_KEYWORDS, {
    Food: ["food", "tea", "coffee", "lunch", "dinner", "breakfast", "snack", "milk", "grocery", "pizza", "momo", "chai", "restaurant", "cafe", "meal"],
    Transport: ["bus", "train", "taxi", "auto", "rickshaw", "uber", "ola", "metro", "cab", "ticket"],
    Shopping: ["shop", "shopping", "clothes", "mobile", "purchase", "buy", "shoes", "dress", "mall", "amazon", "flipkart"],
    Medical: ["medicine", "doctor", "hospital", "health", "pharmacy", "clinic", "medical"],
    Investment: ["investment", "invest", "mutual", "sip", "fund", "portfolio"],
    Travel: ["travel", "trip", "flight", "hotel", "airbnb", "vacation", "holiday"],
    Fuel: ["petrol", "fuel", "diesel", "gasoline"],
    Movies: ["movie", "cinema", "theatre", "film"],
    Games: ["game", "gaming", "playstation", "xbox", "steam"],
    Education: ["school", "college", "book", "course", "fees", "tuition", "class", "exam"],
    Bills: ["electricity", "water", "gas", "internet", "bill", "recharge", "wifi", "utility"],
    Salary: ["salary", "stipend", "paycheck", "income"],
    Freelance: ["freelance", "client", "gig", "project"],
    Gift: ["gift", "bonus", "reward", "cashback"],
    Rent: ["rent", "hostel", "pg", "room"],
    Subscriptions: ["subscription", "netflix", "spotify", "prime", "youtube", "membership"],
    Tax: ["tax", "tds", "gst"],
    Insurance: ["insurance", "premium", "policy"],
    Crypto: ["crypto", "bitcoin", "btc", "ethereum", "eth"],
    Stocks: ["stock", "stocks", "equity", "share", "shares"],
    Savings: ["saving", "savings", "deposit", "fd", "rd"],
    Emergency: ["emergency", "urgent", "repair"],
    Other: []
  });
  delete CATEGORY_KEYWORDS.Utilities;
  delete CATEGORY_KEYWORDS.Health;
  delete CATEGORY_KEYWORDS.Entertainment;

  const CATEGORY_META = {
    Food: { icon: "food", color: "#f97316" },
    Transport: { icon: "car", color: "#2563eb" },
    Shopping: { icon: "bag", color: "#ec4899" },
    Medical: { icon: "heart", color: "#ef4444" },
    Investment: { icon: "trending", color: "#8b5cf6" },
    Travel: { icon: "plane", color: "#06b6d4" },
    Fuel: { icon: "car", color: "#f59e0b" },
    Movies: { icon: "film", color: "#a855f7" },
    Games: { icon: "game", color: "#22c55e" },
    Education: { icon: "book", color: "#0ea5e9" },
    Bills: { icon: "receipt", color: "#ef4444" },
    Salary: { icon: "banknote", color: "#10b981" },
    Freelance: { icon: "spark", color: "#14b8a6" },
    Gift: { icon: "gift", color: "#d8a21b" },
    Rent: { icon: "home", color: "#f97316" },
    Subscriptions: { icon: "calendar", color: "#6366f1" },
    Tax: { icon: "receipt", color: "#dc2626" },
    Insurance: { icon: "shield", color: "#2563eb" },
    Crypto: { icon: "trending", color: "#f59e0b" },
    Stocks: { icon: "chart", color: "#8b5cf6" },
    Savings: { icon: "wallet", color: "#06b6d4" },
    Emergency: { icon: "shield", color: "#2563eb" },
    Other: { icon: "receipt", color: "#64748b" }
  };

  const THEME_ORDER = ["light", "dark", "amoled"];

  const App = {
    db: null,
    profile: null,
    deferredPrompt: null,
    recognition: null,
    currentView: "authView",
    toastTimer: null,
    numberTweens: new Map(),
    lastTiltTarget: null,
    currencySymbols: {
      INR: "Rs",
      NPR: "Rs",
      USD: "$",
      EUR: "EUR",
      GBP: "GBP"
    },

    async init() {
      this.db = await this.openDb();
      this.profile = this.readLocal("profile", null);
      this.removeLocal("session");
      this.migrateLegacyProfile();
      this.applyPreferences();
      this.populateCategorySelects();
      this.setDefaultDates();
      this.bindEvents();
      this.setupInteractions();
      this.setupVoice();
      this.requestPersistentStorage();
      await this.registerServiceWorker();
      await this.routeFromSession();
      this.checkReminders();
      setInterval(() => this.checkReminders(), 60000);
    },

    openDb() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = event.target.result;

          if (!db.objectStoreNames.contains("expenses")) {
            const store = db.createObjectStore("expenses", { keyPath: "id" });
            store.createIndex("date", "date", { unique: false });
            store.createIndex("category", "category", { unique: false });
          }

          if (!db.objectStoreNames.contains("credits")) {
            const store = db.createObjectStore("credits", { keyPath: "id" });
            store.createIndex("type", "type", { unique: false });
            store.createIndex("dueDate", "dueDate", { unique: false });
          }

          if (!db.objectStoreNames.contains("reminders")) {
            const store = db.createObjectStore("reminders", { keyPath: "id" });
            store.createIndex("date", "date", { unique: false });
          }

          if (!db.objectStoreNames.contains("analytics")) {
            const store = db.createObjectStore("analytics", { keyPath: "id" });
            store.createIndex("date", "date", { unique: false });
          }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    },

    tx(storeName, mode = "readonly") {
      return this.db.transaction(storeName, mode).objectStore(storeName);
    },

    add(storeName, value) {
      return this.request(this.tx(storeName, "readwrite").add(value));
    },

    put(storeName, value) {
      return this.request(this.tx(storeName, "readwrite").put(value));
    },

    delete(storeName, id) {
      return this.request(this.tx(storeName, "readwrite").delete(id));
    },

    clear(storeName) {
      return this.request(this.tx(storeName, "readwrite").clear());
    },

    getAll(storeName) {
      return this.request(this.tx(storeName).getAll());
    },

    request(request) {
      return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    },

    readLocal(key, fallback) {
      try {
        const value = localStorage.getItem(`pocketsathi:${key}`);
        return value ? JSON.parse(value) : fallback;
      } catch (error) {
        return fallback;
      }
    },

    writeLocal(key, value) {
      localStorage.setItem(`pocketsathi:${key}`, JSON.stringify(value));
    },

    removeLocal(key) {
      localStorage.removeItem(`pocketsathi:${key}`);
    },

    readSession(key, fallback) {
      try {
        const value = sessionStorage.getItem(`pocketsathi:${key}`);
        return value ? JSON.parse(value) : fallback;
      } catch (error) {
        return fallback;
      }
    },

    writeSession(key, value) {
      sessionStorage.setItem(`pocketsathi:${key}`, JSON.stringify(value));
    },

    removeSession(key) {
      sessionStorage.removeItem(`pocketsathi:${key}`);
    },

    async hashPin(pin, salt) {
      const data = new TextEncoder().encode(`${salt}:${pin}`);
      const digest = await crypto.subtle.digest("SHA-256", data);
      return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
    },

    async routeFromSession() {
      const session = this.readSession("session", null);
      if (this.profile && session === "open") {
        this.fillSettings();
        await this.showView(this.initialRoute());
      } else if (this.profile) {
        this.showAuth();
      } else {
        document.getElementById("loginForm").classList.add("hidden");
        document.getElementById("setupForm").classList.remove("hidden");
        this.showAuth();
      }
    },

    initialRoute() {
      const action = new URLSearchParams(location.search).get("action");
      return {
        add: "addView",
        "add-expense": "addView",
        analytics: "analyticsView",
        debts: "moneyView",
        reminders: "remindersView",
        afford: "affordView",
        survival: "survivalView"
      }[action] || "dashboardView";
    },

    migrateLegacyProfile() {
      if (this.profile) {
        this.profile.monthlyAllowance = Number(this.profile.monthlyAllowance || 0);
        this.profile.cycleDay = Number(this.profile.cycleDay || 1);
        this.writeLocal("profile", this.profile);
        return;
      }

      const legacy = localStorage.getItem("user_profile");
      if (!legacy) return;

      try {
        const parsed = JSON.parse(legacy);
        if (!parsed?.name) return;
        this.profile = {
          name: parsed.name,
          currency: parsed.currency || "INR",
          monthlyAllowance: Number(parsed.monthlyAllowance || 0),
          cycleDay: 1,
          salt: parsed.pin_hash ? "legacy" : String(Date.now()),
          pinHash: parsed.pin_hash || "",
          legacyPin: !!parsed.pin_hash,
          createdAt: parsed.created_at || new Date().toISOString()
        };
        this.writeLocal("profile", this.profile);
      } catch (error) {
        console.warn("Legacy profile migration skipped", error);
      }
    },

    showAuth() {
      this.switchView("authView");
      document.getElementById("bottomNav").classList.add("hidden");
    },

    async showView(viewId) {
      if (!this.profile) {
        this.showAuth();
        return;
      }

      this.switchView(viewId);
      document.getElementById("bottomNav").classList.remove("hidden");
      this.updateNav(viewId);

      if (viewId === "dashboardView") await this.renderDashboard();
      if (viewId === "historyView") await this.renderHistory();
      if (viewId === "moneyView") await this.renderCredits();
      if (viewId === "analyticsView") await this.renderAnalytics();
      if (viewId === "affordView") await this.renderAfford();
      if (viewId === "survivalView") await this.renderSurvival();
      if (viewId === "remindersView") await this.renderReminders();
      if (viewId === "settingsView") this.fillSettings();
    },

    switchView(viewId) {
      document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
      document.getElementById(viewId).classList.add("active");
      this.currentView = viewId;
      window.scrollTo({ top: 0, behavior: "auto" });
    },

    updateNav(viewId) {
      const map = {
        dashboardView: "dashboard",
        addView: "add",
        historyView: "history",
        moneyView: "money",
        analyticsView: "analytics",
        remindersView: "reminders",
        settingsView: "settings"
      };

      document.querySelectorAll(".nav-button").forEach((button) => {
        button.classList.toggle("active", button.dataset.action === map[viewId]);
      });
    },

    bindEvents() {
      document.getElementById("showSetup").addEventListener("click", () => {
        document.getElementById("loginForm").classList.add("hidden");
        document.getElementById("setupForm").classList.remove("hidden");
      });

      document.getElementById("showLogin").addEventListener("click", () => {
        document.getElementById("setupForm").classList.add("hidden");
        document.getElementById("loginForm").classList.remove("hidden");
      });

      document.getElementById("setupForm").addEventListener("submit", (event) => this.createProfile(event));
      document.getElementById("loginForm").addEventListener("submit", (event) => this.login(event));
      document.getElementById("quickExpenseForm").addEventListener("submit", (event) => this.quickAdd(event));
      document.getElementById("expenseForm").addEventListener("submit", (event) => this.saveExpense(event));
      document.getElementById("creditForm").addEventListener("submit", (event) => this.saveCredit(event));
      document.getElementById("reminderForm").addEventListener("submit", (event) => this.saveReminder(event));
      document.getElementById("settingsForm").addEventListener("submit", (event) => this.saveSettings(event));
      document.getElementById("affordForm").addEventListener("submit", (event) => this.checkAfford(event));
      document.getElementById("historyCategory").addEventListener("change", () => this.renderHistory());
      document.getElementById("historyMonth").addEventListener("change", () => this.renderHistory());
      document.getElementById("voiceButton").addEventListener("click", () => this.startVoice());
      document.getElementById("themeToggle").addEventListener("click", () => this.cycleTheme());
      document.getElementById("elderToggle").addEventListener("click", () => this.togglePreference("elder"));
      document.getElementById("universalSearch")?.addEventListener("input", (event) => this.renderSearch(event.target.value));
      document.getElementById("exportJson").addEventListener("click", () => this.exportJson());
      document.getElementById("exportCsv").addEventListener("click", () => this.exportCsv());
      document.getElementById("importFile").addEventListener("change", (event) => this.importJson(event));
      document.getElementById("changePin").addEventListener("click", () => this.changePin());
      document.getElementById("logout").addEventListener("click", () => this.logout());
      document.getElementById("navLogout").addEventListener("click", () => this.logout());
      document.getElementById("installApp").addEventListener("click", () => this.promptInstall());
      document.getElementById("installFromSettings").addEventListener("click", () => this.promptInstall());
      document.getElementById("enableNotifications").addEventListener("click", () => this.requestNotifications(true));

      document.body.addEventListener("click", (event) => {
        const themeButton = event.target.closest("[data-theme-choice]");
        if (themeButton) {
          this.setTheme(themeButton.dataset.themeChoice);
          return;
        }

        const accentButton = event.target.closest("[data-accent]");
        if (accentButton) {
          this.setAccent(accentButton.dataset.accent);
          return;
        }

        const chip = event.target.closest("[data-suggestion]");
        if (chip) {
          document.getElementById("quickExpense").value = chip.dataset.suggestion;
          document.getElementById("quickExpense").focus();
          return;
        }

        const actionButton = event.target.closest("[data-action]");
        if (!actionButton) return;
        const action = actionButton.dataset.action;
        const routes = {
          dashboard: "dashboardView",
          add: "addView",
          history: "historyView",
          money: "moneyView",
          analytics: "analyticsView",
          reminders: "remindersView",
          settings: "settingsView",
          afford: "affordView",
          survival: "survivalView"
        };
        if (routes[action]) this.showView(routes[action]);
      });

      document.body.addEventListener("click", (event) => {
        const button = event.target.closest("[data-record-action]");
        if (!button) return;
        this.handleRecordAction(button.dataset.recordAction, button.dataset.store, button.dataset.id, button);
      });

      window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault();
        this.deferredPrompt = event;
        document.getElementById("installApp").classList.remove("hidden");
      });

      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && this.profile) {
          this.renderDashboard();
          this.checkReminders();
        }
      });

      window.addEventListener("pagehide", () => {
        this.removeSession("session");
      });
    },

    setupInteractions() {
      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
      const syncMotion = () => document.body.classList.toggle("reduce-motion", !!reduceMotion?.matches);
      syncMotion();
      reduceMotion?.addEventListener?.("change", syncMotion);

      document.body.addEventListener("pointerdown", (event) => {
        const target = event.target.closest(".button, .icon-button, .nav-button, .mini-button, .chip, .segment");
        if (!target || this.prefersReducedMotion()) return;
        const rect = target.getBoundingClientRect();
        const ripple = document.createElement("span");
        ripple.className = "ripple";
        ripple.style.left = `${event.clientX - rect.left}px`;
        ripple.style.top = `${event.clientY - rect.top}px`;
        target.appendChild(ripple);
        ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
      }, { passive: true });

      document.body.addEventListener("pointermove", (event) => {
        if (this.prefersReducedMotion() || event.pointerType !== "mouse") return;
        const card = event.target.closest(".interactive-card");
        if (card) {
          if (this.lastTiltTarget && this.lastTiltTarget !== card) this.resetTilt(this.lastTiltTarget);
          this.lastTiltTarget = card;
          const rect = card.getBoundingClientRect();
          const x = (event.clientX - rect.left) / rect.width - 0.5;
          const y = (event.clientY - rect.top) / rect.height - 0.5;
          card.style.setProperty("--tilt-y", `${x * 1.4}deg`);
          card.style.setProperty("--tilt-x", `${y * -1.4}deg`);
        }

        const magnetic = event.target.closest(".magnetic");
        if (magnetic) {
          const rect = magnetic.getBoundingClientRect();
          const x = ((event.clientX - rect.left) / rect.width - 0.5) * 5;
          const y = ((event.clientY - rect.top) / rect.height - 0.5) * 5;
          magnetic.style.translate = `${x}px ${y}px`;
        }
      }, { passive: true });

      document.body.addEventListener("pointerout", (event) => {
        const card = event.target.closest?.(".interactive-card");
        if (card && !card.contains(event.relatedTarget)) this.resetTilt(card);
        const magnetic = event.target.closest?.(".magnetic");
        if (magnetic && !magnetic.contains(event.relatedTarget)) magnetic.style.translate = "";
      }, { passive: true });
    },

    resetTilt(element) {
      element.style.setProperty("--tilt-x", "0deg");
      element.style.setProperty("--tilt-y", "0deg");
      if (this.lastTiltTarget === element) this.lastTiltTarget = null;
    },

    populateCategorySelects() {
      const categories = Object.keys(CATEGORY_KEYWORDS);
      const options = categories.map((category) => `<option value="${category}">${category}</option>`).join("");
      document.getElementById("expenseCategory").innerHTML = options;
      document.getElementById("historyCategory").innerHTML = `<option value="">All categories</option>${options}`;
    },

    setDefaultDates() {
      const today = this.today();
      ["expenseDate", "dueDate", "reminderDate"].forEach((id) => {
        const input = document.getElementById(id);
        if (input) input.value = today;
      });
      const monthInput = document.getElementById("historyMonth");
      if (monthInput && !monthInput.value) monthInput.value = today.slice(0, 7);
    },

    async createProfile(event) {
      event.preventDefault();
      const name = document.getElementById("setupName").value.trim();
      const currency = document.getElementById("setupCurrency").value;
      const monthlyAllowance = Number(document.getElementById("setupAllowance").value || 0);
      const pin = document.getElementById("setupPin").value.trim();
      const confirm = document.getElementById("confirmPin").value.trim();

      if (!name) return this.toast("Please enter your name", "error");
      if (monthlyAllowance < 0) return this.toast("Enter valid pocket money", "error");
      if (!/^\d{4,6}$/.test(pin)) return this.toast("PIN must be 4 to 6 digits", "error");
      if (pin !== confirm) return this.toast("PINs do not match", "error");

      const salt = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
      const pinHash = await this.hashPin(pin, salt);
      this.profile = {
        name,
        currency,
        monthlyAllowance,
        cycleDay: 1,
        salt,
        pinHash,
        createdAt: new Date().toISOString()
      };
      this.writeLocal("profile", this.profile);
      this.writeSession("session", "open");
      event.target.reset();
      this.toast("Profile created", "success");
      await this.showView("dashboardView");
    },

    async login(event) {
      event.preventDefault();
      const pin = document.getElementById("loginPin").value.trim();
      if (!this.profile) return this.toast("Create a local profile first", "warning");
      const pinHash = await this.hashPin(pin, this.profile.salt);
      const legacyHash = btoa(`${pin}PocketSathi_Salt_12345`);
      const isLegacyMatch = this.profile.legacyPin && legacyHash === this.profile.pinHash;

      if (pinHash !== this.profile.pinHash && !isLegacyMatch) {
        document.getElementById("loginPin").value = "";
        return this.toast("Invalid PIN", "error");
      }

      if (isLegacyMatch) {
        this.profile.legacyPin = false;
        this.profile.salt = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
        this.profile.pinHash = await this.hashPin(pin, this.profile.salt);
        this.writeLocal("profile", this.profile);
      }

      this.writeSession("session", "open");
      document.getElementById("loginPin").value = "";
      await this.showView("dashboardView");
    },

    async quickAdd(event) {
      event.preventDefault();
      const input = document.getElementById("quickExpense");
      const text = input.value.trim();
      const debt = this.parseDebtText(text);
      if (debt) {
        await this.addCreditRecord(debt);
        input.value = "";
        this.toast("Debt saved", "success");
        await this.renderDashboard();
        return;
      }

      const parsed = this.parseExpenseText(text);
      if (!parsed.amount) return this.toast("Write like: Tea 20", "warning");

      await this.addExpenseRecord({
        title: parsed.title || "Expense",
        amount: parsed.amount,
        category: parsed.category,
        paymentMethod: "Cash",
        date: parsed.date || this.today(),
        note: ""
      });

      this.rememberSuggestion(`${parsed.title || "Expense"} ${parsed.amount}`);
      input.value = "";
      this.toast("Expense saved", "success");
      await this.renderDashboard();
    },

    async addExpenseRecord(data) {
      await this.add("expenses", {
        id: crypto.randomUUID(),
        title: data.title,
        amount: Number(data.amount),
        category: data.category || this.detectCategory(data.title),
        paymentMethod: data.paymentMethod || "Cash",
        date: data.date || this.today(),
        time: this.timeNow(),
        note: data.note || "",
        createdAt: new Date().toISOString()
      });
    },

    async addCreditRecord(data) {
      const amount = Number(data.amount);
      await this.add("credits", {
        id: crypto.randomUUID(),
        type: data.type,
        person: data.person,
        amount,
        paidAmount: 0,
        remainingAmount: amount,
        dueDate: data.dueDate || this.today(),
        note: data.note || "",
        status: "pending",
        history: [],
        createdAt: new Date().toISOString()
      });
    },

    parseExpenseText(text) {
      const raw = text.trim();
      const amountMatch = raw.match(/(?:rs\.?|₹|\$)?\s*(\d+(?:\.\d+)?)/i);
      const amount = amountMatch ? Number(amountMatch[1]) : 0;
      const title = raw.replace(amountMatch ? amountMatch[0] : "", "").replace(/\s+/g, " ").trim();
      const category = this.detectCategory(raw);
      return { title, amount, category };
    },

    parseDebtText(text) {
      const raw = text.trim();
      const lower = raw.toLowerCase();
      if (!/(lent|loaned|owe|borrow|borrowed|udhar|उधार)/.test(lower)) return null;

      const parsed = this.parseExpenseText(raw);
      if (!parsed.amount) return null;
      const type = /(lent|loaned|gave)/.test(lower) ? "lent" : "owe";
      let person = raw
        .replace(/(?:lent|loaned|gave|owe|borrowed|borrow|from|to|rs\.?|₹|\$|\d+(?:\.\d+)?|udhar|उधार)/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!person) person = "Friend";
      return { type, person, amount: parsed.amount, dueDate: this.today(), note: "Voice or quick entry" };
    },

    parseExpenseText(text) {
      const raw = text.trim();
      const amountMatch = raw.match(/(?:rs\.?|inr|\$)?\s*(\d+(?:\.\d+)?)/i);
      const amount = amountMatch ? Number(amountMatch[1]) : 0;
      const date = this.parseNaturalDate(raw);
      const category = this.detectCategory(raw);
      const title = raw
        .replace(amountMatch ? amountMatch[0] : "", "")
        .replace(/\b(i|spent|spend|paid|pay|bought|buy|on|for|at|today|yesterday|tomorrow)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
      return { title: title || category, amount, category, date };
    },

    parseDebtText(text) {
      const raw = text.trim();
      const lower = raw.toLowerCase();
      if (!/(lent|loaned|owe|borrow|borrowed|udhar)/.test(lower)) return null;

      const parsed = this.parseExpenseText(raw);
      if (!parsed.amount) return null;
      const type = /(lent|loaned|gave)/.test(lower) ? "lent" : "owe";
      let person = raw
        .replace(/(?:lent|loaned|gave|owe|borrowed|borrow|from|to|rs\.?|inr|\$|\d+(?:\.\d+)?|udhar|today|yesterday|tomorrow)/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!person) person = "Friend";
      return { type, person, amount: parsed.amount, dueDate: parsed.date || this.today(), note: "Quick entry" };
    },

    parseNaturalDate(text) {
      const lower = text.toLowerCase();
      const date = new Date();
      if (/\byesterday\b/.test(lower)) date.setDate(date.getDate() - 1);
      if (/\btomorrow\b/.test(lower)) date.setDate(date.getDate() + 1);
      return this.isoDate(date);
    },

    detectCategory(text) {
      const lower = text.toLowerCase();
      for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        if (keywords.some((keyword) => lower.includes(keyword))) return category;
      }
      return "Other";
    },

    async saveExpense(event) {
      event.preventDefault();
      const form = event.target;
      const data = new FormData(form);
      const amount = Number(data.get("amount"));
      const title = String(data.get("title") || "").trim();
      const date = String(data.get("date") || this.today());

      if (!amount || amount <= 0) return this.toast("Enter a valid amount", "error");

      await this.addExpenseRecord({
        title: title || "Expense",
        amount,
        category: data.get("category"),
        paymentMethod: data.get("paymentMethod"),
        date,
        note: String(data.get("note") || "").trim()
      });

      this.rememberSuggestion(`${title || "Expense"} ${amount}`);
      form.reset();
      this.setDefaultDates();
      this.toast("Expense saved", "success");
      await this.showView("dashboardView");
    },

    async saveCredit(event) {
      event.preventDefault();
      const form = event.target;
      const data = new FormData(form);
      const amount = Number(data.get("amount"));
      const person = String(data.get("person") || "").trim();

      if (!person) return this.toast("Enter person name", "error");
      if (!amount || amount <= 0) return this.toast("Enter a valid amount", "error");

      await this.addCreditRecord({
        type: data.get("type"),
        person,
        amount,
        dueDate: data.get("dueDate") || this.today(),
        note: String(data.get("note") || "").trim()
      });

      form.reset();
      this.setDefaultDates();
      this.toast("Debt saved", "success");
      await this.renderCredits();
    },

    async saveReminder(event) {
      event.preventDefault();
      const form = event.target;
      const data = new FormData(form);
      const title = String(data.get("title") || "").trim();
      if (!title) return this.toast("Enter reminder title", "error");

      await this.add("reminders", {
        id: crypto.randomUUID(),
        title,
        date: data.get("date") || this.today(),
        repeat: data.get("repeat"),
        note: String(data.get("note") || "").trim(),
        notifiedOn: "",
        createdAt: new Date().toISOString()
      });

      await this.requestNotifications();
      form.reset();
      this.setDefaultDates();
      this.toast("Reminder saved", "success");
      await this.renderReminders();
    },

    async renderDashboard() {
      const [expenses, credits, reminders] = await Promise.all([this.getAll("expenses"), this.getAll("credits"), this.getAll("reminders")]);
      const stats = this.budgetStats(expenses);
      const pending = credits.filter((record) => record.status !== "completed");
      const borrowed = this.sum(pending.filter((record) => record.type === "owe"), "remainingAmount");
      const lent = this.sum(pending.filter((record) => record.type === "lent"), "remainingAmount");
      const health = this.healthState(stats);
      const biggest = Object.entries(this.groupSum(stats.monthExpenses, "category")).sort((a, b) => b[1] - a[1])[0];
      const score = this.financialHealthScore(stats, borrowed);
      const netWorth = stats.remaining + lent - borrowed;
      const upcomingBills = this.upcomingReminders(reminders, 7);

      document.getElementById("greeting").textContent = `Hi, ${this.profile.name}`;
      this.setMoney("moneyLeft", stats.remaining);
      this.setMoney("monthlyBudget", stats.allowance);
      this.setText("savingsPercent", `${Math.round(stats.savingsPercent)}%`);
      this.setMoney("safeDaily", stats.safeDaily);
      document.getElementById("safeDailyHint").textContent = `${stats.remainingDays} days left of ${stats.cycleDays}`;
      this.setMoney("todayTotal", stats.todayTotal);
      document.getElementById("dailyLimitStatus").textContent = stats.todayTotal > stats.safeDaily && stats.safeDaily > 0 ? "Slow down today" : "Within safe limit";
      document.getElementById("survivalDays").textContent = stats.survivalDays === Infinity ? `${stats.remainingDays} days` : `${stats.survivalDays} days`;
      document.getElementById("survivalHint").textContent = health.hint;
      this.setMoney("borrowedTotal", borrowed);
      this.setMoney("borrowedTotalDetail", borrowed);
      this.setMoney("lentHomeTotal", lent);
      this.setMoney("incomeTotal", stats.allowance);
      this.setMoney("expenseTotal", stats.monthTotal);
      this.setMoney("savingsTotal", stats.remaining);
      this.setText("savingsRate", `${Math.round(stats.savingsPercent)}% rate`);
      this.setMoney("cashFlow", stats.allowance - stats.monthTotal);
      this.setMoney("netWorth", netWorth);
      this.setText("upcomingBills", String(upcomingBills.length));
      this.setNumber("financialHealthScore", score);
      document.getElementById("healthScoreRing")?.style.setProperty("--score", score);
      document.getElementById("aiInsight").textContent = this.smartInsight(stats, borrowed, biggest);
      document.getElementById("monthlyGoalLabel").textContent = `${Math.round(stats.savingsPercent)}%`;
      document.getElementById("monthlyGoalProgress").style.width = `${Math.max(0, Math.min(stats.savingsPercent, 100))}%`;
      document.getElementById("monthlyGoalHint").textContent = stats.allowance ? `${this.money(stats.remaining)} left from this cycle.` : "Set a monthly budget to activate this goal.";

      const healthCard = document.getElementById("healthCard");
      healthCard.classList.remove("status-good", "status-watch", "status-danger");
      healthCard.classList.add(health.className);
      document.getElementById("healthLabel").textContent = health.label;

      this.renderSuggestions();
      this.renderMiniBars("todayBreakdown", this.groupSum(stats.todayExpenses, "category"), "No spending today");
      this.renderCashflowChart(expenses);
      this.renderCalendarHeatmap(expenses);
      this.renderExpenseList("recentList", expenses.sort(this.sortByDateDesc).slice(0, 5), false);
      this.renderCreditList("dueList", pending.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 4), false);
      this.renderSearch(document.getElementById("universalSearch")?.value || "");
      await this.saveDailySnapshot(stats);
    },

    async saveDailySnapshot(stats) {
      try {
        await this.put("analytics", {
          id: this.today(),
          date: this.today(),
          monthTotal: stats.monthTotal,
          todayTotal: stats.todayTotal,
          remaining: stats.remaining,
          safeDaily: stats.safeDaily,
          createdAt: new Date().toISOString()
        });
      } catch (error) {
        console.warn("Daily snapshot skipped", error);
      }
    },

    budgetStats(expenses) {
      const today = this.today();
      const cycle = this.budgetCycle(today);
      const month = today.slice(0, 7);
      const monthExpenses = expenses.filter((expense) => expense.date >= cycle.start && expense.date <= cycle.end);
      const todayExpenses = expenses.filter((expense) => expense.date === today);
      const monthTotal = this.sum(monthExpenses, "amount");
      const todayTotal = this.sum(todayExpenses, "amount");
      const allowance = Number(this.profile?.monthlyAllowance || 0);
      const remaining = allowance > 0 ? Math.max(allowance - monthTotal, 0) : 0;
      const usedDays = this.daysBetween(cycle.start, today) + 1;
      const remainingDays = Math.max(BUDGET_CYCLE_DAYS - usedDays + 1, 1);
      const safeDaily = allowance > 0 ? remaining / Math.max(remainingDays, 1) : 0;
      const dailyAverage = monthTotal / Math.max(usedDays, 1);
      const survivalDays = dailyAverage > 0 ? Math.floor(remaining / dailyAverage) : Infinity;
      const savingsPercent = allowance > 0 ? (remaining / allowance) * 100 : 0;

      return {
        today,
        month,
        cycleStart: cycle.start,
        cycleEnd: cycle.end,
        cycleDays: BUDGET_CYCLE_DAYS,
        allowance,
        monthExpenses,
        todayExpenses,
        monthTotal,
        todayTotal,
        remaining,
        usedDays,
        remainingDays,
        safeDaily,
        dailyAverage,
        survivalDays,
        savingsPercent
      };
    },

    healthState(stats) {
      if (!stats.allowance) return { label: "Setup needed", hint: "Add pocket money", className: "status-watch" };
      if (stats.remaining <= 0) return { label: "Emergency", hint: "Budget finished", className: "status-danger" };
      if (stats.todayTotal > stats.safeDaily && stats.safeDaily > 0) return { label: "Careful", hint: "Daily limit crossed", className: "status-watch" };
      if (stats.survivalDays !== Infinity && stats.survivalDays < stats.remainingDays) return { label: "Watch", hint: `May finish in ${stats.survivalDays} days`, className: "status-watch" };
      return { label: "Safe", hint: "You are on track", className: "status-good" };
    },

    financialHealthScore(stats, borrowed) {
      if (!stats.allowance) return 42;
      const savingsScore = Math.min(stats.savingsPercent, 100) * 0.55;
      const disciplineScore = stats.safeDaily > 0 && stats.todayTotal > stats.safeDaily
        ? Math.max(0, 25 - ((stats.todayTotal - stats.safeDaily) / stats.safeDaily) * 20)
        : 25;
      const debtPenalty = stats.allowance > 0 ? Math.min((borrowed / stats.allowance) * 22, 22) : 0;
      const survivalBonus = stats.survivalDays === Infinity || stats.survivalDays >= stats.remainingDays ? 20 : Math.max(0, (stats.survivalDays / stats.remainingDays) * 20);
      return Math.round(Math.max(0, Math.min(100, savingsScore + disciplineScore + survivalBonus - debtPenalty)));
    },

    upcomingReminders(reminders, daysAhead) {
      const today = this.today();
      const end = new Date();
      end.setDate(end.getDate() + daysAhead);
      const endText = this.isoDate(end);
      return reminders.filter((reminder) => reminder.date >= today && reminder.date <= endText);
    },

    smartInsight(stats, borrowed, biggest) {
      if (!stats.allowance) return "Set your monthly budget and PocketSathi will start forecasting your cycle.";
      if (stats.remaining <= 0) return "Your cycle budget is fully used. Switch to essentials and clear any pending bills first.";
      if (stats.todayTotal > stats.safeDaily && stats.safeDaily > 0) {
        return `Today is over pace by ${this.money(stats.todayTotal - stats.safeDaily)}. Keep the next purchase intentional.`;
      }
      if (borrowed > stats.remaining * 0.5 && borrowed > 0) {
        return `Pending debt is taking pressure off your cash flow. Keep ${this.money(borrowed)} visible before spending.`;
      }
      if (biggest) return `${biggest[0]} is leading this cycle at ${this.money(biggest[1])}. Your budget is still on track.`;
      return "Your spending rhythm is calm. Add transactions to reveal sharper predictions.";
    },

    async renderHistory() {
      let expenses = await this.getAll("expenses");
      const category = document.getElementById("historyCategory").value;
      const month = document.getElementById("historyMonth").value;
      if (category) expenses = expenses.filter((expense) => expense.category === category);
      if (month) expenses = expenses.filter((expense) => expense.date.startsWith(month));
      this.renderExpenseList("historyList", expenses.sort(this.sortByDateDesc), true);
    },

    renderExpenseList(containerId, expenses, withActions) {
      const container = document.getElementById(containerId);
      if (!expenses.length) {
        container.innerHTML = `<div class="empty">No expenses yet</div>`;
        return;
      }

      container.innerHTML = expenses.map((expense) => `
        <article class="item interactive-card">
          <div class="item-main">
            ${this.categoryIcon(expense.category)}
            <div>
              <div class="item-title">${this.escape(expense.title)}</div>
              <div class="item-meta">${this.escape(expense.category)} &middot; ${this.escape(expense.paymentMethod)} &middot; ${expense.date}</div>
              ${expense.note ? `<div class="item-meta">${this.escape(expense.note)}</div>` : ""}
            </div>
          </div>
          <div>
            <div class="item-amount">${this.money(expense.amount)}</div>
            ${withActions ? `<div class="item-actions"><button class="mini-button danger" data-record-action="delete" data-store="expenses" data-id="${expense.id}" type="button">Delete</button></div>` : ""}
          </div>
        </article>
      `).join("");
    },

    async renderCredits() {
      const credits = await this.getAll("credits");
      const active = credits.filter((record) => record.status !== "completed");
      const lent = active.filter((record) => record.type === "lent");
      const owe = active.filter((record) => record.type === "owe");
      this.setMoney("lentTotal", this.sum(lent, "remainingAmount"));
      this.setMoney("oweTotal", this.sum(owe, "remainingAmount"));
      this.renderCreditList("creditList", credits.sort((a, b) => a.dueDate.localeCompare(b.dueDate)), true);
    },

    renderCreditList(containerId, records, withActions) {
      const container = document.getElementById(containerId);
      if (!records.length) {
        container.innerHTML = `<div class="empty">No pending debts</div>`;
        return;
      }

      container.innerHTML = records.map((record) => `
        <article class="item interactive-card">
          <div class="item-main">
            ${this.categoryIcon(record.type === "lent" ? "Savings" : "Bills")}
            <div>
              <div class="item-title">${this.escape(record.person)} ${record.type === "lent" ? "owes you" : "to pay"}</div>
              <div class="item-meta">Due ${record.dueDate} &middot; ${record.status}</div>
              ${record.note ? `<div class="item-meta">${this.escape(record.note)}</div>` : ""}
            </div>
          </div>
          <div>
            <div class="item-amount">${this.money(record.remainingAmount)}</div>
            ${withActions ? `
              <div class="item-actions">
                <button class="mini-button" data-record-action="pay" data-store="credits" data-id="${record.id}" type="button">Pay</button>
                <button class="mini-button" data-record-action="complete" data-store="credits" data-id="${record.id}" type="button">Done</button>
                <button class="mini-button" data-record-action="share" data-store="credits" data-id="${record.id}" type="button">Share</button>
                <button class="mini-button danger" data-record-action="delete" data-store="credits" data-id="${record.id}" type="button">Delete</button>
              </div>` : ""}
          </div>
        </article>
      `).join("");
    },

    async renderAnalytics() {
      const [expenses, credits] = await Promise.all([this.getAll("expenses"), this.getAll("credits")]);
      const stats = this.budgetStats(expenses);
      const categoryGroups = this.groupSum(stats.monthExpenses, "category");
      const biggest = Object.entries(categoryGroups).sort((a, b) => b[1] - a[1])[0];
      const pendingDebt = this.sum(credits.filter((record) => record.status !== "completed"), "remainingAmount");

      this.setMoney("analyticsMonthTotal", stats.monthTotal);
      this.setMoney("dailyAverage", stats.dailyAverage);
      this.setText("biggestCategory", biggest ? biggest[0] : "None");
      this.renderInsights("weeklyInsights", this.weeklyInsights(expenses, stats, pendingDebt, biggest));
      this.renderBars("categoryBars", categoryGroups, "No spending data");
      this.renderBars("weeklyBars", this.groupByWeek(stats.monthExpenses), "No weekly spending yet");
    },

    weeklyInsights(expenses, stats, pendingDebt, biggest) {
      const last7 = this.sum(this.filterDays(expenses, 7), "amount");
      const prev7 = this.sum(this.filterDays(expenses, 14, 7), "amount");
      const streak = this.noOverspendStreak(expenses, stats.allowance);
      const impulseNow = this.sum(this.filterDays(expenses, 7).filter((item) => ["Shopping", "Entertainment"].includes(item.category)), "amount");
      const impulsePrev = this.sum(this.filterDays(expenses, 14, 7).filter((item) => ["Shopping", "Entertainment"].includes(item.category)), "amount");
      const impulseChange = impulsePrev > 0 ? Math.round(((impulseNow - impulsePrev) / impulsePrev) * 100) : 0;
      const insights = [];

      insights.push(biggest ? `Most money went to ${biggest[0]} this month.` : "No category is dominating yet.");
      insights.push(last7 <= prev7 || prev7 === 0 ? "This week is under control." : `This week increased by ${this.money(last7 - prev7)}.`);
      insights.push(`No-overspending streak: ${streak} days.`);
      insights.push(stats.allowance ? `Savings left: ${Math.round(stats.savingsPercent)}%.` : "Set pocket money to unlock survival math.");
      if (impulsePrev > 0) insights.push(`Impulse categories changed by ${impulseChange}% this week.`);
      if (pendingDebt > 0) insights.push(`Pending debt total is ${this.money(pendingDebt)}.`);
      return insights;
    },

    renderInsights(containerId, insights) {
      const container = document.getElementById(containerId);
      container.innerHTML = insights.map((text) => `<div class="insight">${this.escape(text)}</div>`).join("");
    },

    renderBars(containerId, groups, emptyText) {
      const container = document.getElementById(containerId);
      const entries = Object.entries(groups).sort((a, b) => b[1] - a[1]).slice(0, 8);
      if (!entries.length) {
        container.innerHTML = `<div class="empty">${emptyText}</div>`;
        return;
      }

      const max = Math.max(...entries.map((entry) => entry[1]), 1);
      container.innerHTML = entries.map(([label, amount]) => {
        const width = Math.max((amount / max) * 100, 3);
        const color = this.categoryMeta(label).color;
        return `
          <div class="bar-row interactive-card">
            <div class="bar-top"><span>${this.categoryIcon(label)}${this.escape(label)}</span><span>${this.money(amount)}</span></div>
            <div class="bar-track"><div class="bar-fill" style="--bar-color:${color}; width:${width}%"></div></div>
          </div>
        `;
      }).join("");
    },

    renderMiniBars(containerId, groups, emptyText) {
      const container = document.getElementById(containerId);
      const entries = Object.entries(groups).sort((a, b) => b[1] - a[1]);
      if (!entries.length) {
        container.innerHTML = `<div class="empty">${emptyText}</div>`;
        return;
      }

      container.innerHTML = entries.map(([label, amount]) => `
        <div class="mini-bar interactive-card">
          <span>${this.categoryIcon(label)}${this.escape(label)}</span>
          <b>${this.money(amount)}</b>
        </div>
      `).join("");
    },

    renderCashflowChart(expenses) {
      const container = document.getElementById("cashflowChart");
      if (!container) return;
      const groups = this.groupSum(expenses, "date");
      const days = Array.from({ length: 7 }, (_, index) => {
        const date = new Date();
        date.setDate(date.getDate() - (6 - index));
        const dateText = this.isoDate(date);
        return {
          date: dateText,
          label: date.toLocaleDateString([], { weekday: "short" }),
          amount: groups[dateText] || 0
        };
      });
      const max = Math.max(...days.map((day) => day.amount), 1);
      container.innerHTML = days.map((day) => {
        const height = Math.max((day.amount / max) * 100, day.amount > 0 ? 9 : 3);
        return `
          <div class="timeline-bar" title="${day.date}: ${this.money(day.amount)}">
            <span style="height:${height}%"></span>
            <small>${this.escape(day.label)}</small>
          </div>
        `;
      }).join("");
    },

    renderCalendarHeatmap(expenses) {
      const container = document.getElementById("calendarHeatmap");
      if (!container) return;
      const groups = this.groupSum(expenses, "date");
      const values = [];
      for (let index = 29; index >= 0; index -= 1) {
        const date = new Date();
        date.setDate(date.getDate() - index);
        const dateText = this.isoDate(date);
        values.push({ date: dateText, amount: groups[dateText] || 0 });
      }
      const max = Math.max(...values.map((value) => value.amount), 1);
      container.innerHTML = values.map((value) => {
        const level = value.amount ? Math.max(1, Math.ceil((value.amount / max) * 6)) : 0;
        return `<span class="heat-cell" style="--level:${level}" title="${value.date}: ${this.money(value.amount)}"></span>`;
      }).join("");
    },

    async renderAfford() {
      const container = document.getElementById("affordResult");
      if (!container.innerHTML.trim()) {
        const expenses = await this.getAll("expenses");
        const stats = this.budgetStats(expenses);
        container.innerHTML = `
          <div class="result-big">${this.money(stats.safeDaily)}</div>
          <p class="muted">Current safe spending per day</p>
        `;
      }
    },

    async checkAfford(event) {
      event.preventDefault();
      const data = new FormData(event.target);
      const name = String(data.get("name") || "This").trim();
      const amount = Number(data.get("amount"));
      if (!amount || amount <= 0) return this.toast("Enter a valid price", "error");

      const expenses = await this.getAll("expenses");
      const stats = this.budgetStats(expenses);
      const afterRemaining = Math.max(stats.remaining - amount, 0);
      const afterDaily = afterRemaining / Math.max(stats.remainingDays, 1);
      const risk = amount > stats.remaining ? "Not safe" : afterDaily < stats.safeDaily * 0.55 ? "Heavy impact" : "Manageable";
      const container = document.getElementById("affordResult");

      container.innerHTML = `
        <div class="result-big">${this.escape(risk)}</div>
        <p>If you buy ${this.escape(name)}, safe spending becomes <b>${this.money(afterDaily)}</b> per day.</p>
        <p class="muted">Money left after purchase: ${this.money(afterRemaining)}</p>
      `;
    },

    async renderSurvival() {
      const [expenses, credits] = await Promise.all([this.getAll("expenses"), this.getAll("credits")]);
      const stats = this.budgetStats(expenses);
      const health = this.healthState(stats);
      const owe = this.sum(credits.filter((record) => record.type === "owe" && record.status !== "completed"), "remainingAmount");
      const afterDebt = Math.max(stats.remaining - owe, 0);
      const afterDebtDaily = afterDebt / Math.max(stats.remainingDays, 1);

      document.getElementById("survivalPanel").innerHTML = `
        <div class="status-pill">${this.escape(health.label)}</div>
        <div class="result-big">${stats.survivalDays === Infinity ? `${stats.remainingDays} days` : `${stats.survivalDays} days`}</div>
        <p>At the current spending speed, your money may survive this long.</p>
        <div class="debt-strip">
          <span>Safe per day <b>${this.money(stats.safeDaily)}</b></span>
          <span>After debt <b>${this.money(afterDebtDaily)}</b></span>
        </div>
        <p class="muted">${this.escape(health.hint)}</p>
      `;
    },

    async renderReminders() {
      const reminders = await this.getAll("reminders");
      const container = document.getElementById("reminderList");
      if (!reminders.length) {
        container.innerHTML = `<div class="empty">No reminders</div>`;
        return;
      }

      container.innerHTML = reminders.sort((a, b) => a.date.localeCompare(b.date)).map((reminder) => `
        <article class="item interactive-card">
          <div class="item-main">
            ${this.categoryIcon("Bills")}
            <div>
              <div class="item-title">${this.escape(reminder.title)}</div>
              <div class="item-meta">${reminder.date} &middot; ${reminder.repeat}</div>
              ${reminder.note ? `<div class="item-meta">${this.escape(reminder.note)}</div>` : ""}
            </div>
          </div>
          <div class="item-actions">
            <button class="mini-button danger" data-record-action="delete" data-store="reminders" data-id="${reminder.id}" type="button">Delete</button>
          </div>
        </article>
      `).join("");
    },

    async handleRecordAction(action, storeName, id, sourceButton) {
      if (action === "delete") {
        if (!confirm("Delete this record?")) return;
        await this.collapseRecord(sourceButton);
        await this.delete(storeName, id);
        this.toast("Deleted", "success");
      }

      if (storeName === "credits" && action === "complete") {
        const record = await this.findRecord("credits", id);
        if (!record) return;
        record.paidAmount = record.amount;
        record.remainingAmount = 0;
        record.status = "completed";
        record.history = (record.history || []).concat({ type: "complete", amount: record.amount, at: new Date().toISOString() });
        await this.put("credits", record);
        this.toast("Marked complete", "success");
      }

      if (storeName === "credits" && action === "pay") {
        const record = await this.findRecord("credits", id);
        if (!record) return;
        const amount = Number(prompt(`Remaining: ${this.money(record.remainingAmount)}\nPayment amount:`));
        if (!amount || amount <= 0) return;
        if (amount > record.remainingAmount) return this.toast("Payment is more than remaining amount", "error");
        record.paidAmount = Number(record.paidAmount || 0) + amount;
        record.remainingAmount = Math.max(Number(record.remainingAmount || 0) - amount, 0);
        record.status = record.remainingAmount > 0 ? "partial" : "completed";
        record.history = (record.history || []).concat({ type: "payment", amount, at: new Date().toISOString() });
        await this.put("credits", record);
        this.toast("Payment saved", "success");
      }

      if (storeName === "credits" && action === "share") {
        const record = await this.findRecord("credits", id);
        if (!record) return;
        this.shareDebt(record);
      }

      if (this.currentView === "historyView") await this.renderHistory();
      if (this.currentView === "moneyView") await this.renderCredits();
      if (this.currentView === "remindersView") await this.renderReminders();
      if (this.currentView === "dashboardView") await this.renderDashboard();
    },

    collapseRecord(sourceButton) {
      const item = sourceButton?.closest?.(".item");
      if (!item || this.prefersReducedMotion()) return Promise.resolve();
      item.classList.add("deleting");
      return new Promise((resolve) => setTimeout(resolve, 220));
    },

    async findRecord(storeName, id) {
      const records = await this.getAll(storeName);
      return records.find((item) => item.id === id);
    },

    shareDebt(record) {
      const message = record.type === "lent"
        ? `Hi ${record.person}, pending amount is ${this.money(record.remainingAmount)}.`
        : `Reminder for me: pay ${record.person} ${this.money(record.remainingAmount)}.`;
      if (navigator.share) {
        navigator.share({ title: "PocketSathi debt reminder", text: message }).catch(() => {});
        return;
      }
      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener");
    },

    async checkReminders() {
      if (!this.profile) return;
      const [reminders, expenses] = await Promise.all([this.getAll("reminders"), this.getAll("expenses")]);
      const today = this.today();
      const stats = this.budgetStats(expenses);

      if (stats.allowance && stats.remaining <= stats.safeDaily && stats.remaining > 0) {
        this.notify("Low money alert", `Only ${this.money(stats.remaining)} left this month.`);
      }

      if (stats.allowance && stats.todayTotal > stats.safeDaily && stats.safeDaily > 0) {
        this.notify("Budget warning", `Today crossed safe limit by ${this.money(stats.todayTotal - stats.safeDaily)}.`);
      }

      for (const reminder of reminders) {
        if (reminder.repeat === "once" && reminder.notifiedOn) continue;
        if (reminder.date <= today && reminder.notifiedOn !== today) {
          this.notify("PocketSathi reminder", `${reminder.title}${reminder.note ? `: ${reminder.note}` : ""}`);
          reminder.notifiedOn = today;
          reminder.date = this.nextReminderDate(reminder.date, reminder.repeat);
          await this.put("reminders", reminder);
        }
      }
    },

    nextReminderDate(dateText, repeat) {
      if (repeat === "weekly") {
        const date = new Date(`${dateText}T00:00:00`);
        date.setDate(date.getDate() + 7);
        return this.isoDate(date);
      }
      if (repeat === "monthly") {
        const date = new Date(`${dateText}T00:00:00`);
        date.setMonth(date.getMonth() + 1);
        return this.isoDate(date);
      }
      return dateText;
    },

    async requestNotifications(showToast = false) {
      if (!("Notification" in window)) {
        if (showToast) this.toast("Notifications are not supported", "warning");
        return;
      }
      if (Notification.permission === "default") await Notification.requestPermission();
      if (showToast) this.toast(Notification.permission === "granted" ? "Notifications on" : "Notifications blocked", Notification.permission === "granted" ? "success" : "warning");
    },

    notify(title, body) {
      const key = `notify:${title}:${this.today()}`;
      if (this.readLocal(key, false)) return;
      this.writeLocal(key, true);

      if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, { body, tag: "pocketsathi", icon: "icons/icon.svg" });
      } else if (this.currentView !== "authView") {
        this.toast(body, "warning");
      }
    },

    setupVoice() {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) return;

      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = this.readLocal("voiceLang", "en-IN");
      this.recognition.onstart = () => this.toast("Listening...", "success");
      this.recognition.onerror = () => this.toast("Voice input unavailable", "error");
      this.recognition.onresult = async (event) => {
        const transcript = Array.from(event.results).map((result) => result[0].transcript).join(" ");
        document.getElementById("quickExpense").value = transcript;
        await this.quickAdd(new Event("submit"));
      };
    },

    startVoice() {
      if (!this.recognition) return this.toast("Voice recognition is not supported in this browser", "warning");
      this.recognition.start();
    },

    fillSettings() {
      if (!this.profile) return;
      document.getElementById("settingsName").value = this.profile.name;
      document.getElementById("settingsCurrency").value = this.profile.currency;
      document.getElementById("settingsAllowance").value = Number(this.profile.monthlyAllowance || 0);
      document.getElementById("settingsCycleDay").value = Number(this.profile.cycleDay || 1);
    },

    async saveSettings(event) {
      event.preventDefault();
      const form = new FormData(event.target);
      const name = String(form.get("name") || "").trim();
      const monthlyAllowance = Number(form.get("monthlyAllowance") || 0);
      const cycleDay = Math.min(Math.max(Number(form.get("cycleDay") || 1), 1), 28);
      if (!name) return this.toast("Enter your name", "error");
      if (monthlyAllowance < 0) return this.toast("Enter valid pocket money", "error");
      this.profile.name = name;
      this.profile.currency = form.get("currency");
      this.profile.monthlyAllowance = monthlyAllowance;
      this.profile.cycleDay = cycleDay;
      this.writeLocal("profile", this.profile);
      this.toast("Budget saved", "success");
      await this.renderDashboard();
    },

    async changePin() {
      if (!this.profile) return;
      const current = prompt("Current PIN:");
      if (!current) return;
      const currentHash = await this.hashPin(current, this.profile.salt);
      if (currentHash !== this.profile.pinHash) return this.toast("Invalid PIN", "error");

      const next = prompt("New PIN, 4 to 6 digits:");
      if (!/^\d{4,6}$/.test(next || "")) return this.toast("PIN must be 4 to 6 digits", "error");
      const confirm = prompt("Confirm new PIN:");
      if (next !== confirm) return this.toast("PINs do not match", "error");

      this.profile.pinHash = await this.hashPin(next, this.profile.salt);
      this.writeLocal("profile", this.profile);
      this.toast("PIN changed", "success");
    },

    logout() {
      this.removeSession("session");
      this.removeLocal("session");
      document.getElementById("loginForm").classList.remove("hidden");
      document.getElementById("setupForm").classList.add("hidden");
      this.showAuth();
    },

    togglePreference(name) {
      if (name === "dark") {
        this.cycleTheme();
        return;
      }
      const prefs = this.readLocal("preferences", { theme: "light", elder: false, accent: "emerald" });
      prefs[name] = !prefs[name];
      this.writeLocal("preferences", prefs);
      this.applyPreferences();
      this.toast(`${name === "elder" ? "Large text" : name} ${prefs[name] ? "on" : "off"}`, "success");
    },

    cycleTheme() {
      const prefs = this.readLocal("preferences", { theme: "light", elder: false, accent: "emerald" });
      const current = prefs.theme || (prefs.dark ? "dark" : "light");
      const next = THEME_ORDER[(THEME_ORDER.indexOf(current) + 1) % THEME_ORDER.length] || "light";
      this.setTheme(next);
    },

    setTheme(theme) {
      const next = THEME_ORDER.includes(theme) ? theme : "light";
      const prefs = this.readLocal("preferences", { theme: "light", elder: false, accent: "emerald" });
      prefs.theme = next;
      prefs.dark = next !== "light";
      this.writeLocal("preferences", prefs);
      this.applyPreferences();
      this.toast(`${next.toUpperCase()} theme`, "success");
    },

    setAccent(accent) {
      const allowed = ["emerald", "cyan", "purple", "gold"];
      const prefs = this.readLocal("preferences", { theme: "light", elder: false, accent: "emerald" });
      prefs.accent = allowed.includes(accent) ? accent : "emerald";
      this.writeLocal("preferences", prefs);
      this.applyPreferences();
      this.toast("Accent updated", "success");
    },

    applyPreferences() {
      const prefs = this.readLocal("preferences", { theme: "light", elder: false, accent: "emerald" });
      const theme = prefs.theme || (prefs.dark ? "dark" : "light");
      document.body.classList.toggle("theme-light", theme === "light");
      document.body.classList.toggle("theme-dark", theme === "dark");
      document.body.classList.toggle("theme-amoled", theme === "amoled");
      document.body.classList.toggle("dark", theme !== "light");
      document.body.classList.toggle("elder", !!prefs.elder);
      ["emerald", "cyan", "purple", "gold"].forEach((accent) => {
        document.body.classList.toggle(`accent-${accent}`, prefs.accent === accent && accent !== "emerald");
      });
      document.querySelectorAll("[data-theme-choice]").forEach((button) => {
        button.classList.toggle("active", button.dataset.themeChoice === theme);
      });
    },

    async promptInstall() {
      if (!this.deferredPrompt) {
        this.toast("Use browser install menu if available", "warning");
        return;
      }
      this.deferredPrompt.prompt();
      await this.deferredPrompt.userChoice;
      this.deferredPrompt = null;
      document.getElementById("installApp").classList.add("hidden");
    },

    rememberSuggestion(value) {
      const cleaned = value.trim().replace(/\s+/g, " ");
      if (!cleaned) return;
      const recent = this.readLocal("suggestions", []);
      this.writeLocal("suggestions", [cleaned].concat(recent.filter((item) => item !== cleaned)).slice(0, 8));
    },

    renderSuggestions() {
      const suggestions = this.readLocal("suggestions", ["Tea 20", "Lunch 80", "Bus 30", "Recharge 199"]).slice(0, 6);
      const container = document.getElementById("recentSuggestions");
      container.innerHTML = suggestions.map((item) => {
        const category = this.detectCategory(item);
        return `<button class="chip magnetic" data-suggestion="${this.escape(item)}" type="button">${this.categoryIcon(category)}<span>${this.escape(item)}</span></button>`;
      }).join("");
    },

    async exportJson() {
      const data = await this.collectExport();
      this.download(`pocketsathi-backup-${this.today()}.json`, JSON.stringify(data, null, 2), "application/json");
      this.toast("JSON backup ready", "success");
    },

    async exportCsv() {
      const expenses = await this.getAll("expenses");
      const rows = [["date", "time", "title", "amount", "category", "payment_method", "note"]]
        .concat(expenses.sort(this.sortByDateDesc).map((expense) => [
          expense.date,
          expense.time,
          expense.title,
          expense.amount,
          expense.category,
          expense.paymentMethod,
          expense.note || ""
        ]));
      const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
      this.download(`pocketsathi-expenses-${this.today()}.csv`, csv, "text/csv");
      this.toast("CSV export ready", "success");
    },

    async collectExport() {
      const [expenses, credits, reminders, analytics] = await Promise.all(STORES.map((store) => this.getAll(store)));
      return {
        app: "PocketSathi",
        version: 3,
        exportedAt: new Date().toISOString(),
        profile: this.profile ? {
          name: this.profile.name,
          currency: this.profile.currency,
          monthlyAllowance: this.profile.monthlyAllowance,
          cycleDay: this.profile.cycleDay
        } : null,
        expenses,
        credits,
        reminders,
        analytics
      };
    },

    async importJson(event) {
      const file = event.target.files[0];
      if (!file) return;

      try {
        const data = JSON.parse(await file.text());
        if (!confirm("Import will replace local expenses, debts, reminders, and analytics. Continue?")) return;

        await Promise.all(STORES.map((store) => this.clear(store)));
        for (const store of STORES) {
          if (Array.isArray(data[store])) {
            for (const item of data[store]) await this.add(store, item);
          }
        }

        this.toast("Import complete", "success");
        await this.renderDashboard();
      } catch (error) {
        this.toast("Could not import file", "error");
      } finally {
        event.target.value = "";
      }
    },

    download(filename, content, type) {
      const blob = new Blob([content], { type });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    },

    setText(id, value) {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    },

    setMoney(id, amount) {
      const element = document.getElementById(id);
      if (!element) return;
      const target = Number(amount || 0);
      if (this.prefersReducedMotion()) {
        element.textContent = this.money(target);
        element.dataset.value = String(target);
        return;
      }

      const from = Number(element.dataset.value || this.extractNumber(element.textContent) || 0);
      const start = performance.now();
      const duration = 650;
      const previous = this.numberTweens.get(id);
      if (previous) cancelAnimationFrame(previous);

      const tick = (time) => {
        const progress = Math.min((time - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const value = from + (target - from) * eased;
        element.textContent = this.money(value);
        if (progress < 1) {
          this.numberTweens.set(id, requestAnimationFrame(tick));
        } else {
          element.dataset.value = String(target);
          this.numberTweens.delete(id);
        }
      };
      this.numberTweens.set(id, requestAnimationFrame(tick));
    },

    setNumber(id, value) {
      const element = document.getElementById(id);
      if (!element) return;
      const target = Number(value || 0);
      if (this.prefersReducedMotion()) {
        element.textContent = String(target);
        element.dataset.value = String(target);
        return;
      }

      const from = Number(element.dataset.value || this.extractNumber(element.textContent) || 0);
      const start = performance.now();
      const duration = 650;
      const previous = this.numberTweens.get(id);
      if (previous) cancelAnimationFrame(previous);

      const tick = (time) => {
        const progress = Math.min((time - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(from + (target - from) * eased);
        element.textContent = String(current);
        if (progress < 1) {
          this.numberTweens.set(id, requestAnimationFrame(tick));
        } else {
          element.dataset.value = String(target);
          this.numberTweens.delete(id);
        }
      };
      this.numberTweens.set(id, requestAnimationFrame(tick));
    },

    extractNumber(value) {
      const match = String(value).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
      return match ? Number(match[0]) : 0;
    },

    categoryMeta(category) {
      return CATEGORY_META[category] || CATEGORY_META.Other;
    },

    categoryIcon(category) {
      const meta = this.categoryMeta(category);
      return `<span class="category-icon" style="--icon-color:${meta.color}"><svg aria-hidden="true"><use href="#icon-${meta.icon}"></use></svg></span>`;
    },

    prefersReducedMotion() {
      return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || document.body.classList.contains("reduce-motion");
    },

    async renderSearch(query) {
      const container = document.getElementById("searchResults");
      if (!container) return;
      const term = String(query || "").trim().toLowerCase();
      if (!term) {
        container.innerHTML = "";
        return;
      }

      const [expenses, credits, reminders] = await Promise.all([this.getAll("expenses"), this.getAll("credits"), this.getAll("reminders")]);
      const matches = [];
      expenses.forEach((expense) => {
        const haystack = `${expense.title} ${expense.category} ${expense.paymentMethod} ${expense.note || ""} ${expense.date}`.toLowerCase();
        if (haystack.includes(term)) matches.push({ type: "Expense", icon: expense.category, title: expense.title, meta: `${expense.category} &middot; ${expense.date}`, amount: expense.amount });
      });
      credits.forEach((record) => {
        const haystack = `${record.person} ${record.type} ${record.note || ""} ${record.status} ${record.dueDate}`.toLowerCase();
        if (haystack.includes(term)) matches.push({ type: "Debt", icon: record.type === "lent" ? "Savings" : "Bills", title: record.person, meta: `${record.type} &middot; due ${record.dueDate}`, amount: record.remainingAmount });
      });
      reminders.forEach((reminder) => {
        const haystack = `${reminder.title} ${reminder.repeat} ${reminder.note || ""} ${reminder.date}`.toLowerCase();
        if (haystack.includes(term)) matches.push({ type: "Bill", icon: "Bills", title: reminder.title, meta: `${reminder.repeat} &middot; ${reminder.date}`, amount: null });
      });

      if (!matches.length) {
        container.innerHTML = `<div class="empty">No matches</div>`;
        return;
      }

      container.innerHTML = matches.slice(0, 8).map((item) => `
        <article class="item interactive-card">
          <div class="item-main">
            ${this.categoryIcon(item.icon)}
            <div>
              <div class="item-title">${this.escape(item.title)}</div>
              <div class="item-meta">${this.escape(item.type)} &middot; ${item.meta}</div>
            </div>
          </div>
          ${item.amount === null ? "" : `<div class="item-amount">${this.money(item.amount)}</div>`}
        </article>
      `).join("");
    },

    groupSum(items, key) {
      return items.reduce((groups, item) => {
        groups[item[key]] = (groups[item[key]] || 0) + Number(item.amount || 0);
        return groups;
      }, {});
    },

    groupByWeek(items) {
      return items.reduce((groups, item) => {
        const day = Number(item.date.slice(8, 10));
        const label = `Week ${Math.ceil(day / 7)}`;
        groups[label] = (groups[label] || 0) + Number(item.amount || 0);
        return groups;
      }, {});
    },

    filterDays(items, daysBack, offset = 0) {
      const end = new Date();
      end.setDate(end.getDate() - offset);
      const start = new Date(end);
      start.setDate(start.getDate() - daysBack + 1);
      const startText = this.isoDate(start);
      const endText = this.isoDate(end);
      return items.filter((item) => item.date >= startText && item.date <= endText);
    },

    noOverspendStreak(expenses, allowance) {
      if (!allowance) return 0;
      const dailyBase = allowance / BUDGET_CYCLE_DAYS;
      const groups = this.groupSum(expenses, "date");
      let streak = 0;
      const cursor = new Date();
      for (let i = 0; i < 31; i += 1) {
        const dateText = this.isoDate(cursor);
        if ((groups[dateText] || 0) > dailyBase) break;
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
      }
      return streak;
    },

    sum(items, key) {
      return items.reduce((total, item) => total + Number(item[key] || 0), 0);
    },

    sortByDateDesc(a, b) {
      return `${b.date} ${b.time || ""}`.localeCompare(`${a.date} ${a.time || ""}`);
    },

    money(amount) {
      const symbol = this.currencySymbols[this.profile?.currency || "INR"] || "Rs";
      return `${symbol} ${Number(amount || 0).toFixed(2)}`;
    },

    today() {
      return this.isoDate(new Date());
    },

    isoDate(date) {
      const offset = date.getTimezoneOffset() * 60000;
      return new Date(date.getTime() - offset).toISOString().slice(0, 10);
    },

    budgetCycle(dateText) {
      const cycleDay = Math.min(Math.max(Number(this.profile?.cycleDay || 1), 1), 28);
      const today = new Date(`${dateText}T00:00:00`);
      const start = new Date(today.getFullYear(), today.getMonth(), cycleDay);
      if (today < start) start.setMonth(start.getMonth() - 1);
      const end = new Date(start);
      end.setDate(end.getDate() + BUDGET_CYCLE_DAYS - 1);
      return {
        start: this.isoDate(start),
        end: this.isoDate(end)
      };
    },

    daysBetween(startText, endText) {
      const start = new Date(`${startText}T00:00:00`);
      const end = new Date(`${endText}T00:00:00`);
      return Math.max(Math.floor((end - start) / 86400000), 0);
    },

    timeNow() {
      return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    },

    escape(value) {
      return String(value).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[char]);
    },

    toast(message, type = "info") {
      const toast = document.getElementById("toast");
      toast.textContent = message;
      toast.className = `toast show ${type}`;
      if (type === "success") this.confetti();
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
    },

    confetti() {
      if (this.prefersReducedMotion()) return;
      const layer = document.getElementById("confettiLayer");
      if (!layer) return;
      const colors = ["#10b981", "#06b6d4", "#8b5cf6", "#d8a21b", "#ef4444"];
      for (let index = 0; index < 18; index += 1) {
        const piece = document.createElement("span");
        piece.className = "confetti-piece";
        piece.style.left = `${35 + Math.random() * 30}%`;
        piece.style.background = colors[index % colors.length];
        piece.style.setProperty("--x", `${(Math.random() - 0.5) * 260}px`);
        piece.style.setProperty("--r", `${(Math.random() - 0.5) * 540}deg`);
        piece.style.animationDelay = `${Math.random() * 90}ms`;
        layer.appendChild(piece);
        piece.addEventListener("animationend", () => piece.remove(), { once: true });
      }
    },

    async registerServiceWorker() {
      if (!("serviceWorker" in navigator)) return;
      try {
        await navigator.serviceWorker.register("service-worker.js");
      } catch (error) {
        console.warn("Service worker registration failed", error);
      }
    },

    async requestPersistentStorage() {
      if (navigator.storage?.persist) {
        try {
          await navigator.storage.persist();
        } catch (error) {
          console.warn("Persistent storage request failed", error);
        }
      }
    }
  };

  window.PocketSathi = App;
  document.addEventListener("DOMContentLoaded", () => {
    App.init().catch((error) => {
      console.error(error);
      const toast = document.getElementById("toast");
      if (toast) {
        toast.textContent = "PocketSathi could not start";
        toast.className = "toast show error";
      }
    });
  });
})();
