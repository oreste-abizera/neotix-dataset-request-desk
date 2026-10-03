import { ArrowLeft } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { describeError, fieldErrors } from "@/api/errors";
import { useCreateRequest } from "@/api/queries/requests";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/states";
import { isoDate } from "@/lib/format";

interface Values {
  task_name: string;
  episodes_requested: number;
  deadline: string;
  notes: string;
}

const NOTES_MAX = 2000;
const FIELDS = ["task_name", "episodes_requested", "deadline", "notes"] as const;

export default function NewRequestPage() {
  const navigate = useNavigate();
  const create = useCreateRequest();
  const today = isoDate(new Date());
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<Values>({
    mode: "onTouched",
    defaultValues: { task_name: "", episodes_requested: 10, deadline: "", notes: "" },
  });
  const notesLength = (useWatch({ control, name: "notes" }) ?? "").length;

  const onSubmit = (values: Values) =>
    create.mutate(
      {
        ...values,
        task_name: values.task_name.trim(),
        episodes_requested: Number(values.episodes_requested),
      },
      {
        onSuccess: (created) => {
          toast.success("Request submitted", { description: "You can follow its progress here." });
          navigate(`/requests/${created.id}`);
        },
        onError: (error) => {
          // Show the server's complaint next to the field it is about.
          for (const [field, message] of Object.entries(fieldErrors(error))) {
            if ((FIELDS as readonly string[]).includes(field))
              setError(field as keyof Values, { message });
          }
        },
      },
    );

  const serverFormError =
    create.error && Object.keys(fieldErrors(create.error)).length === 0
      ? describeError(create.error)
      : null;

  return (
    <>
      <Link
        to="/requests"
        className="-ml-2 mb-3 inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 text-base text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> All requests
      </Link>
      <PageHeader
        title="New dataset request"
        description="Tell us what you need. An operator will start on it and keep you posted."
      />

      <Card className="max-w-2xl">
        <CardBody>
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
            {serverFormError && <Alert>{serverFormError}</Alert>}

            <Field
              label="Task"
              required
              hint="What the robot should be doing in the recordings, e.g. “pick cup”."
              error={errors.task_name?.message}
            >
              {(props) => (
                <Input
                  {...props}
                  maxLength={200}
                  autoComplete="off"
                  {...register("task_name", {
                    validate: (v) => v.trim().length > 0 || "Describe the task you need",
                  })}
                />
              )}
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Number of episodes" required error={errors.episodes_requested?.message}>
                {(props) => (
                  <Input
                    {...props}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={100000}
                    {...register("episodes_requested", {
                      valueAsNumber: true,
                      required: "Enter how many episodes you need",
                      min: { value: 1, message: "Ask for at least 1 episode" },
                      max: {
                        value: 100000,
                        message: "That is more than we can deliver in one request (100,000)",
                      },
                      validate: (v) => Number.isInteger(v) || "Use a whole number",
                    })}
                  />
                )}
              </Field>

              <Field label="Needed by" required error={errors.deadline?.message}>
                {(props) => (
                  <Input
                    {...props}
                    type="date"
                    min={today}
                    {...register("deadline", {
                      required: "Pick a deadline",
                      validate: (v) => v >= today || "The deadline cannot be in the past",
                    })}
                  />
                )}
              </Field>
            </div>

            <Field
              label="Notes"
              hint={`Anything that helps: environments, robots, lighting. ${notesLength}/${NOTES_MAX}`}
              error={errors.notes?.message}
            >
              {(props) => (
                <Textarea
                  {...props}
                  rows={5}
                  maxLength={NOTES_MAX}
                  {...register("notes", {
                    maxLength: {
                      value: NOTES_MAX,
                      message: `Keep notes under ${NOTES_MAX} characters`,
                    },
                  })}
                />
              )}
            </Field>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" asChild>
                <Link to="/requests">Cancel</Link>
              </Button>
              <Button type="submit" loading={create.isPending}>
                {create.isPending ? "Submitting…" : "Submit request"}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </>
  );
}
