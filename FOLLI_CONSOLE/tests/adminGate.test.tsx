import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import AdminGateScreen from '../src/screens/AdminGateScreen';
import { ADMIN_PASSWORD } from '../src/config';

describe('AdminGateScreen (password gate to EXIT)', () => {
  it('rejects an incorrect password and does not unlock', () => {
    const onSuccess = jest.fn();
    const onCancel = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <AdminGateScreen onSuccess={onSuccess} onCancel={onCancel} />,
    );

    fireEvent.changeText(getByTestId('admin-password-input'), 'wrongpass');
    fireEvent.press(getByTestId('admin-submit'));

    expect(onSuccess).not.toHaveBeenCalled();
    expect(queryByTestId('admin-error')).not.toBeNull();
  });

  it('unlocks when the correct password is entered', () => {
    const onSuccess = jest.fn();
    const onCancel = jest.fn();
    const { getByTestId } = render(
      <AdminGateScreen onSuccess={onSuccess} onCancel={onCancel} />,
    );

    fireEvent.changeText(getByTestId('admin-password-input'), ADMIN_PASSWORD);
    fireEvent.press(getByTestId('admin-submit'));

    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('clears the error once the user edits the field again', () => {
    const { getByTestId, queryByTestId } = render(
      <AdminGateScreen onSuccess={jest.fn()} onCancel={jest.fn()} />,
    );

    fireEvent.changeText(getByTestId('admin-password-input'), 'nope');
    fireEvent.press(getByTestId('admin-submit'));
    expect(queryByTestId('admin-error')).not.toBeNull();

    fireEvent.changeText(getByTestId('admin-password-input'), 'n');
    expect(queryByTestId('admin-error')).toBeNull();
  });

  it('cancel returns to the console without unlocking', () => {
    const onSuccess = jest.fn();
    const onCancel = jest.fn();
    const { getByTestId } = render(
      <AdminGateScreen onSuccess={onSuccess} onCancel={onCancel} />,
    );

    fireEvent.press(getByTestId('admin-cancel'));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
