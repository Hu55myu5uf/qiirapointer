import { useAlertStore, ThemedAlertButton, AlertType } from '../store/alertStore';

/**
 * QIIRA Themed confirm dialog.
 * Works seamlessly across native and web with the QIIRA design theme,
 * cancel/back button and confirm/action button.
 */
export function confirmAction(
    title: string,
    message: string,
    onConfirm: () => void | Promise<void>,
    confirmText: string = 'Confirm',
    cancelText: string = 'Cancel',
    isDestructive: boolean = true
): void {
    useAlertStore.getState().showAlert(
        title,
        message,
        [
            {
                text: cancelText,
                style: 'cancel',
            },
            {
                text: confirmText,
                style: isDestructive ? 'destructive' : 'default',
                onPress: () => onConfirm(),
            },
        ],
        {
            type: isDestructive ? 'warning' : 'confirm',
            cancelable: true,
        }
    );
}

/**
 * Display a themed popup with customized title, message, and button actions.
 */
export function showAlert(
    title: string,
    message?: string,
    buttons?: ThemedAlertButton[],
    type?: AlertType
): void {
    useAlertStore.getState().showAlert(title, message, buttons, { type });
}

/**
 * Display a success themed popup
 */
export function showSuccess(title: string, message?: string, onOk?: () => void): void {
    useAlertStore.getState().showAlert(
        title,
        message,
        [{ text: 'OK', style: 'default', onPress: onOk }],
        { type: 'success' }
    );
}

/**
 * Display an error themed popup
 */
export function showError(title: string, message?: string, onOk?: () => void): void {
    useAlertStore.getState().showAlert(
        title,
        message,
        [{ text: 'OK', style: 'default', onPress: onOk }],
        { type: 'error' }
    );
}
