# Custom Confirm Dialog

A reusable confirmation dialog component that replaces the default browser `confirm()` with a styled, accessible dialog overlay.

## Features

- **Styled overlay**: Dark background with blur effect
- **Customizable**: Set title, description, button text, and variant
- **Accessible**: Includes ARIA attributes and keyboard support (ESC to close)
- **Promise-based**: Easy async/await usage
- **Variants**: Default and destructive styles

## Usage

### 1. Import the hook and dialog component

```jsx
import { ConfirmDialog } from "./ui/confirm-dialog";
import { useConfirm } from "./ui/use-confirm";
```

### 2. Initialize the hook in your component

```jsx
function MyComponent() {
  const { confirm, confirmState, handleClose } = useConfirm();
  
  // ... your component code
}
```

### 3. Add the dialog component to your JSX (at the end)

```jsx
return (
  <div>
    {/* Your other components */}
    
    <ConfirmDialog
      isOpen={confirmState.isOpen}
      onClose={handleClose}
      onConfirm={confirmState.onConfirm}
      title={confirmState.title}
      description={confirmState.description}
      confirmText={confirmState.confirmText}
      cancelText={confirmState.cancelText}
      variant={confirmState.variant}
    />
  </div>
);
```

### 4. Call the confirm function

```jsx
const handleDelete = async () => {
  const confirmed = await confirm({
    title: "Delete Item",
    description: "Are you sure you want to delete this item? This action cannot be undone.",
    confirmText: "Delete",
    cancelText: "Cancel",
    variant: "destructive",
  });
  
  if (confirmed) {
    // User clicked "Delete"
    // Perform deletion
  } else {
    // User clicked "Cancel" or closed the dialog
  }
};
```

## API

### `useConfirm()` Hook

Returns an object with:
- `confirm(options)`: Function to show the dialog, returns a Promise<boolean>
- `confirmState`: Current state of the dialog
- `handleClose()`: Function to close the dialog

### `confirm(options)` Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `title` | string | required | Dialog title |
| `description` | string | optional | Dialog description/message |
| `confirmText` | string | "Confirm" | Text for the confirm button |
| `cancelText` | string | "Cancel" | Text for the cancel button |
| `variant` | string | "default" | Button variant: "default" or "destructive" |

### `ConfirmDialog` Component Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `isOpen` | boolean | yes | Controls dialog visibility |
| `onClose` | function | yes | Called when dialog should close |
| `onConfirm` | function | yes | Called when user confirms |
| `title` | string | yes | Dialog title |
| `description` | string | no | Dialog description |
| `confirmText` | string | no | Confirm button text |
| `cancelText` | string | no | Cancel button text |
| `variant` | string | no | Button variant |

## Examples

### Simple Confirmation

```jsx
const confirmed = await confirm({
  title: "Continue?",
  description: "Are you sure you want to continue?",
});
```

### Destructive Action

```jsx
const confirmed = await confirm({
  title: "Delete Account",
  description: "This will permanently delete your account and all associated data.",
  confirmText: "Delete Account",
  variant: "destructive",
});
```

### Custom Button Text

```jsx
const confirmed = await confirm({
  title: "Save Changes",
  description: "You have unsaved changes. Do you want to save them?",
  confirmText: "Save",
  cancelText: "Discard",
});
```
