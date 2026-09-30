import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { lightColors, darkColors } from '../constants/theme';

type ThemeType = 'light' | 'dark';
type ColorsType = typeof lightColors;

interface ThemeContextProps {
    theme: ThemeType;
    colors: ColorsType;
    toggleTheme: () => void;
    setTheme: (theme: ThemeType) => void;
}

const ThemeContext = createContext<ThemeContextProps>({
    theme: 'light',
    colors: lightColors,
    toggleTheme: () => {},
    setTheme: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const systemTheme = useColorScheme();
    const [theme, setThemeState] = useState<ThemeType>(systemTheme === 'dark' ? 'dark' : 'light');

    const toggleTheme = () => {
        setThemeState((prev) => (prev === 'light' ? 'dark' : 'light'));
    };

    const colors = theme === 'dark' ? darkColors : lightColors;

    return (
        <ThemeContext.Provider value={{ theme, colors, toggleTheme, setTheme: setThemeState }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);
