// Matches Clerk's hosted components to the DevScale palette for the current theme.
const SHARED = { borderRadius: '0.6rem' };

const VARIABLES = {
  dark: {
    colorPrimary: '#477eff', colorBackground: '#171d28', colorInputBackground: '#202838',
    colorInputText: '#f1f3f8', colorText: '#f1f3f8', colorTextSecondary: '#9299a8', colorNeutral: '#f1f3f8',
    colorDanger: '#f16c78', colorSuccess: '#27c995',
  },
  light: {
    colorPrimary: '#1f4fc4', colorBackground: '#ffffff', colorInputBackground: '#eef1f6',
    colorInputText: '#111827', colorText: '#111827', colorTextSecondary: '#475467', colorNeutral: '#111827',
    colorDanger: '#a82639', colorSuccess: '#096247',
  },
};
const CARD_BORDER = { dark: '1px solid #2a3342', light: '1px solid #d8dde7' };
const CARD_BG = { dark: '#171d28', light: '#ffffff' };

export function clerkAppearanceFor(theme = 'dark') {
  const t = theme === 'light' ? 'light' : 'dark';
  return {
    variables: { ...VARIABLES[t], ...SHARED },
    elements: {
      card: { boxShadow: 'none', border: CARD_BORDER[t], background: CARD_BG[t] },
      footerAction: { display: 'none' }, // sign-in/up switching is handled by AuthScreen
    },
  };
}

// Kept for callers that want the default (dark) look.
export const clerkAppearance = clerkAppearanceFor('dark');
