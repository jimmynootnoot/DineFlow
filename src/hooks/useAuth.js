import { useEffect, useMemo, useState } from 'react';
import { supabase, supabaseConfigError } from '../services/supabase';

export const ROLE_CONFIG = {
  Management: { id: 'management', label: 'Management', description: 'Manage menus, kitchen operations and sales.', allowedPanels: ['menu', 'order_creation', 'kitchen', 'order_tracking', 'sales'] },
  Customer: {
    id: 'customer',
    label: 'Customer',
    description: 'Place new dine-in or pickup orders.',
    allowedPanels: ['order_creation'],
  },
  Kitchen: {
    id: 'kitchen',
    label: 'Kitchen Staff',
    description: 'Access the production queue and manage order progress.',
    allowedPanels: ['kitchen', 'order_tracking'],
  },
  Cashier: {
    id: 'cashier',
    label: 'Cashier',
    description: 'Manage menu availability, create orders, and view sales.',
    allowedPanels: ['menu', 'order_creation', 'order_tracking', 'sales'],
  },
  Staff: {
    id: 'staff',
    label: 'Restaurant Staff',
    description: 'Manage menu availability, customer requests, orders, and sales.',
    allowedPanels: ['menu', 'order_creation', 'order_tracking', 'sales'],
  },
  Admin: {
    id: 'admin',
    label: 'Administrator',
    description: 'Full platform access and configuration controls.',
    allowedPanels: ['menu', 'order_creation', 'kitchen', 'order_tracking', 'sales'],
  },
};

const ROLE_NAMES = {
  management: 'Management',
  admin: 'Admin',
  kitchen: 'Kitchen',
  cashier: 'Cashier',
  staff: 'Staff',
  customer: 'Customer',
};

const defaultLoginForm = {
  email: '',
  password: '',
  name: '',
  intent: 'login',
};

const normalizeRole = (role) => ROLE_NAMES[String(role || '').toLowerCase()] || 'Customer';

async function getSessionUser(authUser) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', authUser.id)
    .maybeSingle();

  if (error) throw error;

  const metadata = authUser.user_metadata || {};
  return {
    id: authUser.id,
    email: authUser.email,
    name:
      profile?.full_name ||
      metadata.full_name ||
      metadata.name ||
      authUser.email?.split('@')[0] ||
      'User',
    role: normalizeRole(profile?.role),
  };
}

function friendlyAuthError(error) {
  if (error?.message === 'Invalid login credentials') {
    return 'Incorrect email or password.';
  }
  if (error?.message?.toLowerCase().includes('email not confirmed')) {
    return 'Confirm your email address before signing in.';
  }
  return error?.message || 'Authentication failed. Check your connection and try again.';
}

export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loginForm, setLoginForm] = useState(defaultLoginForm);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    if (supabaseConfigError) {
      setError(supabaseConfigError);
      setLoading(false);
      return undefined;
    }

    const applySession = async (session) => {
      if (!session?.user) {
        if (active) setUser(null);
        return;
      }

      try {
        const sessionUser = await getSessionUser(session.user);
        if (active) {
          setUser(sessionUser);
          setError(null);
        }
      } catch (sessionError) {
        if (active) {
          setUser(null);
          setError(`Signed in, but the profile could not be loaded: ${sessionError.message}`);
        }
      }
    };

    supabase.auth.getSession()
      .then(({ data, error: sessionError }) => {
        if (sessionError) throw sessionError;
        return applySession(data.session);
      })
      .catch((sessionError) => {
        if (active) setError(friendlyAuthError(sessionError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      void applySession(session);
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleLoginChange = (field, value) => {
    setLoginForm((previous) => ({ ...previous, [field]: value }));
    if (error) setError(null);
    if (notice) setNotice(null);
  };

  const handleAuthSubmit = async (event, intent = 'login') => {
    event.preventDefault();
    setLoginForm((previous) => ({ ...previous, intent }));
    setError(null);
    setNotice(null);

    if (supabaseConfigError) {
      setError(supabaseConfigError);
      return;
    }

    const email = loginForm.email.trim();
    if (!email || !loginForm.password) {
      setError('Please provide both an email address and password.');
      return;
    }

    try {
      setLoading(true);

      if (intent === 'signup') {
        if (!loginForm.name.trim()) {
          throw new Error('Please enter your full name.');
        }
        if (loginForm.password.length < 6) {
          throw new Error('Password must be at least 6 characters.');
        }

        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password: loginForm.password,
          options: {
            data: { full_name: loginForm.name.trim() },
          },
        });

        if (signUpError) throw signUpError;

        if (data.session && data.user) {
          setUser(await getSessionUser(data.user));
          setLoginForm(defaultLoginForm);
        } else {
          setNotice('Account created. Check your email to confirm it, then sign in.');
          setLoginForm((previous) => ({ ...previous, password: '', intent: 'signup' }));
        }
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password: loginForm.password,
        });

        if (signInError) throw signInError;
        setUser(await getSessionUser(data.user));
        setLoginForm(defaultLoginForm);
      }
    } catch (authError) {
      console.error('Supabase auth error', authError);
      setError(friendlyAuthError(authError));
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(friendlyAuthError(signOutError));
      return;
    }

    setUser(null);
    setLoginForm(defaultLoginForm);
    setError(null);
    setNotice(null);
  };

  const roleOptions = useMemo(
    () => Object.entries(ROLE_CONFIG).map(([value, details]) => ({ value, ...details })),
    []
  );

  return {
    user,
    loginForm,
    loginError: error,
    authNotice: notice,
    roleOptions,
    handleLogout,
    handleLoginChange,
    handleAuthSubmit,
    authLoading: loading,
  };
};
