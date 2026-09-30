const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'App.tsx');
let content = fs.readFileSync(file, 'utf8');

// 1. Add import
if (!content.includes('import SettingsScreen')) {
    content = content.replace(
        "import VendorReviewsScreen from './src/screens/VendorReviewsScreen';",
        "import VendorReviewsScreen from './src/screens/VendorReviewsScreen';\nimport SettingsScreen from './src/screens/SettingsScreen';"
    );
}

// 2. Add to ClientTabs tabIcon logic
content = content.replace(
    "else if (route.name === 'Favorites') icon = focused ? '❤️' : '🤍';",
    "else if (route.name === 'Favorites') icon = focused ? '❤️' : '🤍';\n          else if (route.name === 'Settings') icon = '⚙️';"
);

// Add Screen to ClientTabs
content = content.replace(
    "</Tab.Navigator>\n  );\n}\n\n// Client Messages Stack",
    `      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarLabel: 'Settings',
        }}
      />
    </Tab.Navigator>
  );
}

// Client Messages Stack`
);

// 3. Add to VendorTabs tabIcon logic
content = content.replace(
    "else if (route.name === 'Verification') icon = '✅';",
    "else if (route.name === 'Verification') icon = '✅';\n          else if (route.name === 'Settings') icon = '⚙️';"
);

// Add Screen to VendorTabs
content = content.replace(
    "</Tab.Navigator>\n  );\n}\n\n// Admin Tabs",
    `      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarLabel: 'Settings',
        }}
      />
    </Tab.Navigator>
  );
}

// Admin Tabs`
);

// 4. Add to AdminTabs tabIcon logic
content = content.replace(
    "else if (route.name === 'Users') icon = '👥';",
    "else if (route.name === 'Users') icon = '👥';\n          else if (route.name === 'Settings') icon = '⚙️';"
);

// Add Screen to AdminTabs
content = content.replace(
    "</Tab.Navigator>\n  );\n}\n\nexport default function App()",
    `      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarLabel: 'Settings',
        }}
      />
    </Tab.Navigator>
  );
}

export default function App()`
);

fs.writeFileSync(file, content, 'utf8');
console.log('App.tsx updated with Settings tab');
