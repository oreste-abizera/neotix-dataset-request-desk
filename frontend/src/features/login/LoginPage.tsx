import { CheckCircle2, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useLocation, useNavigate } from "react-router";
import { describeError } from "@/api/errors";
import { useLogin } from "@/api/queries/auth";
import { EXPIRED_FLAG } from "@/app/providers";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/states";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

interface Values {
  email: string;
  password: string;
}

function takeExpiredNotice(): boolean {
  try {
    const expired = sessionStorage.getItem(EXPIRED_FLAG) === "1";
    sessionStorage.removeItem(EXPIRED_FLAG);
    return expired;
  } catch {
    return false;
  }
}

const POINTS = [
  "Request a dataset and follow it from submission to delivery",
  "Review the delivered episodes, then accept or send them back",
  "Operators see new work and export progress live",
];

export default function LoginPage() {
  useDocumentTitle("Sign in");
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [expired] = useState(takeExpiredNotice);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>();

  const from = (location.state as { from?: string } | null)?.from ?? "/requests";

  const onSubmit = (values: Values) =>
    login.mutate(values, { onSuccess: () => navigate(from, { replace: true }) });

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="hidden flex-col justify-between bg-primary p-12 text-primary-foreground lg:flex">
        <Logo className="[&_svg_*]:fill-current text-primary-foreground" />
        <div>
          <p className="max-w-md text-2xl font-semibold tracking-tight text-balance">
            Robot data, requested and delivered without the spreadsheet.
          </p>
          <ul className="mt-8 flex max-w-md flex-col gap-4">
            {POINTS.map((p) => (
              <li key={p} className="flex gap-3">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm opacity-80">Internal platform</p>
      </aside>

      <main id="main" className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <Logo className="mb-8 lg:hidden" />
          <h1 className="text-xl sm:text-2xl">Sign in</h1>
          <p className="mt-1 mb-6 text-muted-foreground">
            Use the account your administrator created for you.
          </p>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            {expired && !login.error && (
              <Alert tone="info">Your session has ended. Please sign in again.</Alert>
            )}
            {login.error && <Alert>{describeError(login.error)}</Alert>}

            <Field label="Email" error={errors.email?.message} required>
              {(props) => (
                <Input
                  {...props}
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  {...register("email", {
                    required: "Enter your email address",
                    pattern: { value: /^\S+@\S+\.\S+$/, message: "Enter a valid email address" },
                  })}
                />
              )}
            </Field>

            <Field label="Password" error={errors.password?.message} required>
              {(props) => (
                <div className="relative">
                  <Input
                    {...props}
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    className="pr-11"
                    {...register("password", { required: "Enter your password" })}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute top-1/2 right-1 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" aria-hidden />
                    ) : (
                      <Eye className="size-4" aria-hidden />
                    )}
                  </button>
                </div>
              )}
            </Field>

            <Button type="submit" size="lg" loading={login.isPending} className="mt-2">
              {login.isPending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
