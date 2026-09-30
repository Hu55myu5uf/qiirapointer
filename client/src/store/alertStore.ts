import { create } from 'zustand';
import { Alert as RNAlert, Platform } from 'react-native';

export type AlertType = 'info' | 'success' | 'warning' | 'error' | 'confirm';

export interface ThemedAlertButton {
    text: string;
    onPress?: () => void | Promise<void>;
    style?: 'default' | 'cancel' | 'destructive';
}

export interface ThemedAlertData {
    id: string;
    title: string;
    message?: string;
    type: AlertType;
    buttons: ThemedAlertButton[];
    cancelable?: boolean;
    onDismiss?: () => void;
}

interface AlertStoreState {
    currentAlert: ThemedAlertData | null;
    showAlert: (
        title: string,
        message?: string,
        buttons?: ThemedAlertButton[],
        options?: { cancelable?: boolean; onDismiss?: () => void; type?: AlertType }
    ) => void;
    hideAlert: () => void;
}

/**
 * Infer alert type from title/message/buttons if not explicitly provided
 */
function inferAlertType(title: string, message?: string, buttons?: ThemedAlertButton[]): AlertType {
    const combined = `${title || ''} ${message || ''}`.toLowerCase();
    
    if (combined.includes('error') || combined.includes('failed') || combined.includes('denied') || combined.includes('unable') || combined.includes('invalid')) {
        return 'error';
    }
    if (combined.includes('success') || combined.includes('saved') || combined.includes('verified') || combined.includes('completed') || combined.includes('published') || combined.includes('🎉')) {
        return 'success';
    }
    if (combined.includes('warning') || combined.includes('suspended') || combined.includes('required') || combined.includes('missing')) {
        return 'warning';
    }
    if (buttons && buttons.some(b => b.style === 'destructive' || b.text.toLowerCase().includes('delete') || b.text.toLowerCase().includes('remove'))) {
        return 'warning';
    }
    if (buttons && buttons.length > 1) {
        return 'confirm';
    }
    return 'info';
}

export const useAlertStore = create<AlertStoreState>((set) => ({
    currentAlert: null,

    showAlert: (title, message, buttons, options) => {
        let alertButtons: ThemedAlertButton[] = [];

        if (buttons && buttons.length > 0) {
            alertButtons = buttons;
        } else {
            alertButtons = [
                {
                    text: 'OK',
                    style: 'default',
                }
            ];
        }

        const type: AlertType = options?.type || inferAlertType(title, message, buttons);

        set({
            currentAlert: {
                id: `${Date.now()}_${Math.random()}`,
                title: title || 'Notification',
                message: message || '',
                type,
                buttons: alertButtons,
                cancelable: options?.cancelable ?? true,
                onDismiss: options?.onDismiss,
            },
        });
    },

    hideAlert: () => {
        set((state) => {
            if (state.currentAlert?.onDismiss) {
                try {
                    state.currentAlert.onDismiss();
                } catch (e) {
                    console.error('Alert onDismiss error:', e);
                }
            }
            return { currentAlert: null };
        });
    },
}));

/**
 * Installs global monkey patches so standard Alert.alert() across all components
 * renders through our custom themed modal on both native and web.
 */
let isPatched = false;
export function initGlobalAlertPatch() {
    if (isPatched) return;
    isPatched = true;

    RNAlert.alert = (
        title: string,
        message?: string,
        buttons?: ThemedAlertButton[] | any[],
        options?: any
    ) => {
        useAlertStore.getState().showAlert(title, message, buttons, options);
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
        // Also intercept window.alert so web fallback calls use QIIRA theme
        window.alert = (message?: any) => {
            useAlertStore.getState().showAlert('Notification', String(message || ''));
        };
    }
}
