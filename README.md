# PocketSathi - Personal Finance Tracker

## 🎯 Overview

**PocketSathi** is a completely free, offline-first Progressive Web App (PWA) for personal finance and expense tracking. It works entirely in the browser without requiring any backend, database, or paid services.

### Key Features

✅ **100% Free** - No hidden costs, no premium features
✅ **Works Offline** - Full functionality without internet
✅ **No Backend Required** - All data stored locally on your device
✅ **Privacy First** - Your data never leaves your device
✅ **Installable** - Use like a native mobile app
✅ **Simple UI** - Easy to use for everyone
✅ **Voice Entry** - Add expenses by speaking
✅ **Dark Mode** - Easy on the eyes
✅ **Elder Mode** - Larger text and buttons
✅ **Multi-Currency** - Support for INR, USD, EUR, GBP, PKR

## 📋 Features

### Core Features
- **Quick Expense Entry** - Add expenses in seconds
- **Voice Expense Entry** - Speak to add expenses
- **Expense History** - View and filter all expenses
- **Credit/Debit Tracking** - Manage who owes you and what you owe
- **Analytics & Reports** - See where your money goes
- **Reminders** - Get notified of bills and due dates
- **Data Export/Import** - Backup and restore in JSON format

### Technical Features
- **IndexedDB Storage** - Fast, reliable local database
- **Service Worker** - Offline caching and PWA support
- **Responsive Design** - Works on phones, tablets, desktops
- **Dark Mode** - Reduces eye strain
- **Elder Mode** - Larger fonts and buttons
- **Multiple Languages** - English, Hindi (expandable)

## 🚀 Getting Started

### Installation

1. **Clone or Download**
   ```bash
   git clone https://github.com/yourusername/PocketSathi.git
   cd PocketSathi
   ```

2. **Local Development**
   - Use any HTTP server:
   ```bash
   # Python 3
   python -m http.server 8000
   
   # Python 2
   python -m SimpleHTTPServer 8000
   
   # Node.js
   npx http-server
   ```

3. **Access the App**
   - Open `http://localhost:8000` in your browser

### Deployment (Free Hosting)

#### Option 1: GitHub Pages
```bash
1. Push code to GitHub repository
2. Enable GitHub Pages in repository settings
3. App will be live at: https://yourusername.github.io/PocketSathi
```

#### Option 2: Netlify
```bash
1. Connect your GitHub repo to Netlify
2. Build command: (leave empty)
3. Publish directory: / (root)
4. Deploy!
```

#### Option 3: Vercel
```bash
1. Import project from GitHub
2. No build configuration needed
3. Deploy with one click
```

## 📱 Usage

### First Time Setup
1. Open the app
2. Create a PIN (4-6 digits)
3. Enter your name and preferred currency
4. Start adding expenses!

### Adding Expenses
- **Quick Add**: Click "Quick Add" button
- **Voice Add**: Click microphone icon and speak
- Enter amount, category, and date
- Save!

### Tracking Credit/Debt
1. Go to "Lending" tab
2. Add lending or debt records
3. Mark payments as you make them
4. Track pending dues

### Viewing Analytics
1. Go to "Analytics" tab
2. See monthly spending total and daily average
3. View breakdown by category
4. Visual charts for better insights

## 🔒 Security & Privacy

- **Local Storage**: All data stored in your browser
- **No Tracking**: No analytics or tracking code
- **PIN Protection**: Optional PIN lock for privacy
- **Export Control**: You can export or delete your data anytime
- **No Servers**: No data sent to any server

## 📊 Data Storage

Data is stored in **IndexedDB** (browser's local database):
- `expenses` - All expense records
- `credits` - Credit/debit records
- `reminders` - Reminder settings
- `settings` - User preferences

### Backup Your Data
1. Go to Settings
2. Click "Export Data (JSON)"
3. Save the file safely

### Restore Your Data
1. Go to Settings
2. Click "Import Data"
3. Select your backup file

## 🌐 Browser Support

Works on all modern browsers:
- ✅ Chrome/Edge 60+
- ✅ Firefox 55+
- ✅ Safari 12+
- ✅ Android Chrome
- ✅ iOS Safari

## 📲 PWA Installation

### On Mobile
1. Open app in browser
2. Tap menu (three dots)
3. Select "Install app" or "Add to home screen"
4. App will work like native app

### On Desktop (Chrome)
1. Open app in Chrome
2. Click the install icon in address bar
3. App will open in a window

## 🎨 Customization

### Dark Mode
- Click moon icon in header
- Preference is saved

### Elder Mode
- Click glasses icon in header
- Larger text and buttons
- Simpler interface

### Language
- Go to Settings
- Select your language
- Changes take effect immediately

## 🛠️ Development

### Project Structure
```
PocketSathi/
├── index.html           # Main HTML
├── manifest.json        # PWA manifest
├── service-worker.js    # Offline support
├── css/
│   └── styles.css       # All styling
├── js/
│   ├── app.js           # Main initializer
│   ├── storage.js       # IndexedDB management
│   ├── auth.js          # Authentication
│   ├── expenses.js      # Expense management
│   ├── credit-debit.js  # Credit/debit tracking
│   ├── voice.js         # Voice recognition
│   ├── analytics.js     # Analytics & charts
│   ├── reminders.js     # Reminders & notifications
│   └── ui.js            # UI controller
├── icons/               # App icons (folder)
├── db/                  # Database schema (folder)
└── assets/              # Static assets (folder)
```

### Key Files
- `storage.js` - IndexedDB wrapper
- `auth.js` - PIN-based authentication
- `expenses.js` - Core expense functionality
- `ui.js` - Screen navigation and UI logic
- `app.js` - Application bootstrap

## 🧪 Testing

### Offline Testing
1. Open DevTools (F12)
2. Go to Network tab
3. Check "Offline"
4. App should still work!

### Local Storage Testing
1. Open DevTools
2. Go to Application → IndexedDB
3. See PocketSathiDB
4. All data visible there

## 🐛 Troubleshooting

### App won't load
- Clear browser cache
- Hard refresh (Ctrl+Shift+R)
- Check console for errors

### Offline not working
- Make sure service worker is registered
- Check Application → Service Workers in DevTools
- Clear browser cache and reload

### Data not saving
- Check if localStorage is enabled
- Check browser storage quota
- See browser console for errors

## 🔄 Updates

To update the app:
1. Update files on server
2. Service worker will auto-update cache
3. Or manually clear cache in browser settings

## 📈 Roadmap

### Future Features
- Multi-device sync (optional Firebase)
- Family wallet sharing
- Bill reminders
- Budget alerts
- AI expense categorization
- Multiple user profiles
- CSV export
- Receipt photo capture

### Improvements
- Better charts and visualizations
- More languages
- Advanced filtering
- Recurring expenses
- Custom categories

## 🤝 Contributing

We welcome contributions! 

### How to Contribute
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

### Ideas for Contribution
- New languages
- Additional features
- Bug fixes
- Documentation
- UI/UX improvements

## 📄 License

MIT License - Free for personal and commercial use

## 🙏 Support

- Found a bug? Open an issue on GitHub
- Have a feature request? Let us know!
- Need help? Check the documentation

## 🎓 Credits

- Built with vanilla JavaScript, HTML5, CSS3
- Icons from Font Awesome
- Charts from Chart.js
- Free forever 💚

## 📞 Contact

- Email: support@pocketsathi.com
- GitHub: [@yourprofile](https://github.com/yourprofile)
- Twitter: [@yourhandle](https://twitter.com/yourhandle)

---

**Made with ❤️ for everyone who wants to track their money without expensive apps.**

**PocketSathi - Your Personal Money Assistant** 💰
