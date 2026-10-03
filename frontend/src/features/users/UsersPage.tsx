import { Eye, EyeOff, UserPlus } from "lucide-react";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { ApiError, describeError, fieldErrors } from "@/api/errors";
import { useCreateUser, useUpdateUser, useUsers } from "@/api/queries/users";
import type { Role, User } from "@/api/types";
import { useUser } from "@/app/guards";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, ErrorState } from "@/components/ui/states";
import { Switch } from "@/components/ui/switch";
import { Table, TableScroll, Td, Th } from "@/components/ui/table";
import { Tip } from "@/components/ui/tooltip";
import { useFocusReturn } from "@/hooks/useFocusReturn";
import { cn } from "@/lib/cn";
import { ROLE_LABEL } from "@/lib/copy";

const ROLES: Role[] = ["client", "operator", "admin"];

interface FormValues {
  email: string;
  name: string;
  role: Role;
  organisation: string;
  password: string;
}

function CreateUserDialog({
  open,
  onOpenChange,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCloseAutoFocus: (event: Event) => void;
}) {
  const create = useCreateUser();
  const [show, setShow] = useState(false);
  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    mode: "onTouched",
    defaultValues: { role: "client", email: "", name: "", organisation: "", password: "" },
  });
  const role = useWatch({ control, name: "role" });

  const close = (next: boolean) => {
    if (!next) {
      reset();
      create.reset();
      setShow(false);
    }
    onOpenChange(next);
  };

  const onSubmit = (v: FormValues) =>
    create.mutate(
      {
        email: v.email.trim(),
        name: v.name.trim(),
        role: v.role,
        password: v.password,
        organisation: v.role === "client" ? v.organisation.trim() || null : null,
      },
      {
        onSuccess: (u) => {
          toast.success(`Created ${u.name}`, { description: `${ROLE_LABEL[u.role]} · ${u.email}` });
          close(false);
        },
        onError: (e) => {
          if (e instanceof ApiError && e.code === "email_taken")
            setError("email", { message: "A user with this email already exists" });
          for (const [f, message] of Object.entries(fieldErrors(e))) {
            if (f === "email" || f === "name" || f === "password") setError(f, { message });
          }
        },
      },
    );

  const formError =
    create.error &&
    !(create.error instanceof ApiError && create.error.code === "email_taken") &&
    Object.keys(fieldErrors(create.error)).length === 0
      ? describeError(create.error)
      : null;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        title="Create user"
        description="They can sign in right away with the password you set."
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          {formError && <Alert>{formError}</Alert>}
          <Field label="Email" required error={errors.email?.message}>
            {(p) => (
              <Input
                {...p}
                type="email"
                autoComplete="off"
                {...register("email", {
                  required: "Enter an email address",
                  pattern: { value: /^\S+@\S+\.\S+$/, message: "Enter a valid email address" },
                })}
              />
            )}
          </Field>
          <Field label="Full name" required error={errors.name?.message}>
            {(p) => (
              <Input
                {...p}
                autoComplete="off"
                maxLength={120}
                {...register("name", { validate: (v) => v.trim().length > 0 || "Enter a name" })}
              />
            )}
          </Field>
          <Field label="Role" required>
            {(p) => (
              <Select {...p} {...register("role")}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {role === "client" && (
            <Field label="Organisation" hint="Shown to staff next to this client's requests.">
              {(p) => (
                <Input {...p} autoComplete="off" maxLength={120} {...register("organisation")} />
              )}
            </Field>
          )}
          <Field
            label="Initial password"
            required
            hint="At least 8 characters."
            error={errors.password?.message}
          >
            {(p) => (
              <div className="relative">
                <Input
                  {...p}
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  className="pr-11"
                  {...register("password", {
                    required: "Set a password",
                    minLength: { value: 8, message: "Use at least 8 characters" },
                  })}
                />
                <button
                  type="button"
                  aria-label={show ? "Hide password" : "Show password"}
                  aria-pressed={show}
                  onClick={() => setShow((s) => !s)}
                  className="absolute top-1/2 right-1 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {show ? (
                    <EyeOff className="size-4" aria-hidden />
                  ) : (
                    <Eye className="size-4" aria-hidden />
                  )}
                </button>
              </div>
            )}
          </Field>
          <div className="mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              Create user
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RoleSelect({
  user,
  me,
  scope,
  onChange,
}: {
  user: User;
  me: User;
  scope: string;
  onChange: (r: Role) => void;
}) {
  const self = user.id === me.id;
  const select = (
    <Select
      aria-label={`Role for ${user.name}`}
      aria-describedby={self ? `self-role-${scope}-${user.id}` : undefined}
      value={user.role}
      disabled={self}
      onChange={(e) => onChange(e.target.value as Role)}
      className="h-9 min-w-32"
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABEL[r]}
        </option>
      ))}
    </Select>
  );
  if (!self) return select;
  // A disabled control cannot take focus, so the reason is attached to it for screen readers and
  // shown as a tooltip for pointer users.
  return (
    <Tip label="You can't change your own role">
      <div>
        {select}
        <span id={`self-role-${scope}-${user.id}`} className="sr-only">
          You can't change your own role.
        </span>
      </div>
    </Tip>
  );
}

function ActiveSwitch({
  user,
  me,
  scope,
  onToggle,
  onOpener,
}: {
  user: User;
  me: User;
  scope: string;
  onToggle: (next: boolean) => void;
  onOpener: (event: { currentTarget: HTMLElement }) => void;
}) {
  const self = user.id === me.id;
  const sw = (
    <Switch
      onClick={onOpener}
      checked={user.is_active}
      disabled={self}
      aria-label={`${user.name} is ${user.is_active ? "active" : "deactivated"}`}
      aria-describedby={self ? `self-active-${scope}-${user.id}` : undefined}
      onCheckedChange={onToggle}
    />
  );
  return (
    <div className="flex items-center gap-2">
      {self ? (
        <Tip label="You can't deactivate yourself">
          <span>{sw}</span>
        </Tip>
      ) : (
        sw
      )}
      <span className={cn("text-sm", user.is_active ? "text-foreground" : "text-muted-foreground")}>
        {user.is_active ? "Active" : "Deactivated"}
      </span>
      {self && (
        <span id={`self-active-${scope}-${user.id}`} className="sr-only">
          You can't deactivate yourself.
        </span>
      )}
    </div>
  );
}

export default function UsersPage() {
  const me = useUser();
  const users = useUsers();
  const update = useUpdateUser();
  const [createOpen, setCreateOpen] = useState(false);
  const [deactivating, setDeactivating] = useState<User | null>(null);
  const deactivateFocus = useFocusReturn();
  const createFocus = useFocusReturn();

  const changeRole = (u: User, role: Role) =>
    update.mutate(
      { id: u.id, patch: { role } },
      {
        onSuccess: () => toast.success(`${u.name} is now ${ROLE_LABEL[role].toLowerCase()}`),
        onError: (e) => toast.error("Could not change the role", { description: describeError(e) }),
      },
    );

  const setActive = (u: User, next: boolean) => {
    if (!next) return setDeactivating(u);
    update.mutate(
      { id: u.id, patch: { is_active: true } },
      {
        onSuccess: () => toast.success(`${u.name} can sign in again`),
        onError: (e) => toast.error("Could not reactivate", { description: describeError(e) }),
      },
    );
  };

  return (
    <>
      <PageHeader
        title="Users"
        description="Create accounts and control who can do what. Changes take effect on the person's next action."
        actions={
          <Button
            onClick={(e) => {
              createFocus.remember(e);
              setCreateOpen(true);
            }}
          >
            <UserPlus className="size-4" aria-hidden />
            Create user
          </Button>
        }
      />
      {users.isPending ? (
        <div
          role="status"
          aria-label="Loading users"
          aria-busy="true"
          className="flex flex-col gap-3"
        >
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : users.isError ? (
        <Card>
          <ErrorState
            message={describeError(users.error)}
            onRetry={() => void users.refetch()}
            retrying={users.isFetching}
          />
        </Card>
      ) : (
        <>
          <div className="hidden md:block">
            <Card className="overflow-hidden">
              <TableScroll label="Users">
                <Table>
                  <caption className="sr-only">User accounts</caption>
                  <thead>
                    <tr>
                      <Th>Name</Th>
                      <Th>Email</Th>
                      <Th>Role</Th>
                      <Th>Status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.data.map((u) => (
                      <tr key={u.id} className={cn(!u.is_active && "opacity-70")}>
                        <Td>
                          <span className="font-medium">{u.name}</span>
                          {u.id === me.id && (
                            <span className="ml-2 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary">
                              You
                            </span>
                          )}
                          {u.organisation && (
                            <div className="text-sm text-muted-foreground">{u.organisation}</div>
                          )}
                        </Td>
                        <Td className="text-muted-foreground">{u.email}</Td>
                        <Td>
                          <RoleSelect
                            user={u}
                            me={me}
                            scope="table"
                            onChange={(r) => changeRole(u, r)}
                          />
                        </Td>
                        <Td>
                          <ActiveSwitch
                            user={u}
                            me={me}
                            scope="table"
                            onToggle={(n) => setActive(u, n)}
                            onOpener={deactivateFocus.remember}
                          />
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableScroll>
            </Card>
          </div>
          <ul className="flex flex-col gap-3 md:hidden">
            {users.data.map((u) => (
              <li
                key={u.id}
                className={cn(
                  "rounded-lg border border-line bg-surface p-4 shadow-xs",
                  !u.is_active && "opacity-70",
                )}
              >
                <p className="font-medium">
                  {u.name}
                  {u.id === me.id && (
                    <span className="ml-2 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary">
                      You
                    </span>
                  )}
                </p>
                <p className="text-sm break-all text-muted-foreground">
                  {u.email}
                  {u.organisation ? ` · ${u.organisation}` : ""}
                </p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <RoleSelect user={u} me={me} scope="card" onChange={(r) => changeRole(u, r)} />
                  <ActiveSwitch
                    user={u}
                    me={me}
                    scope="card"
                    onToggle={(n) => setActive(u, n)}
                    onOpener={deactivateFocus.remember}
                  />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCloseAutoFocus={createFocus.onCloseAutoFocus}
      />
      {deactivating && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeactivating(null)}
          title={`Deactivate ${deactivating.name}?`}
          description="They are signed out immediately and cannot sign in until you reactivate them. Their requests and history are kept."
          confirmLabel="Deactivate"
          onCloseAutoFocus={deactivateFocus.onCloseAutoFocus}
          tone="danger"
          onConfirm={() =>
            update.mutateAsync({ id: deactivating.id, patch: { is_active: false } }).then(() => {
              toast.success(`${deactivating.name} was deactivated`);
            })
          }
        />
      )}
    </>
  );
}
