// ===== Voice Recognition Module =====
const voice = {
    recognition: null,
    isListening: false,

    // Initialize speech recognition
    init() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.warn('Speech Recognition not supported');
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = false;
        this.recognition.lang = 'en-US';

        this.recognition.onstart = () => {
            this.isListening = true;
            ui.showToast('Listening...', 'success');
        };

        this.recognition.onresult = (event) => {
            let transcript = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                transcript += event.results[i][0].transcript;
            }
            this.processVoiceInput(transcript);
        };

        this.recognition.onerror = (event) => {
            this.isListening = false;
            ui.showToast(`Error: ${event.error}`, 'error');
        };

        this.recognition.onend = () => {
            this.isListening = false;
        };
    },

    // Start voice input
    start() {
        if (!this.recognition) {
            ui.showToast('Voice recognition not supported', 'error');
            return;
        }

        if (!this.isListening) {
            this.recognition.start();
        }
    },

    // Stop listening
    stop() {
        if (this.recognition && this.isListening) {
            this.recognition.stop();
        }
    },

    // Process voice input and extract expense data
    async processVoiceInput(transcript) {
        try {
            console.log('Transcript:', transcript);

            // Simple regex patterns for parsing
            const amountMatch = transcript.match(/(\d+(?:\.\d{2})?)/);
            const categoryKeywords = {
                food: ['food', 'eat', 'lunch', 'breakfast', 'dinner', 'snack', 'tea', 'coffee'],
                transport: ['petrol', 'fuel', 'taxi', 'auto', 'bus', 'train', 'travel'],
                shopping: ['buy', 'shop', 'purchase', 'clothes', 'book'],
                entertainment: ['movie', 'game', 'fun', 'entertainment'],
                utilities: ['electricity', 'water', 'bill', 'internet'],
                health: ['medicine', 'doctor', 'health', 'pharmacy'],
                education: ['school', 'college', 'study', 'course'],
            };

            let category = 'Other';
            const lowerTranscript = transcript.toLowerCase();

            for (const [cat, keywords] of Object.entries(categoryKeywords)) {
                if (keywords.some(kw => lowerTranscript.includes(kw))) {
                    category = cat.charAt(0).toUpperCase() + cat.slice(1);
                    break;
                }
            }

            if (amountMatch) {
                const amount = parseFloat(amountMatch[1]);

                // Fill the form
                document.getElementById('expenseAmount').value = amount;
                document.getElementById('expenseCategory').value = category;
                document.getElementById('expenseTitle').value = transcript.substring(0, 100);
                document.getElementById('expenseDate').valueAsDate = new Date();

                ui.showAddExpenseScreen();
                ui.showToast(`Amount: ₹${amount}, Category: ${category}`, 'success');
            } else {
                ui.showToast('Could not detect amount. Please enter manually.', 'warning');
                ui.showAddExpenseScreen();
            }
        } catch (error) {
            console.error('Error processing voice input:', error);
            ui.showToast('Error processing voice input', 'error');
        }
    }
};
