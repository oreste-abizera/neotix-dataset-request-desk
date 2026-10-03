import { Compass } from "lucide-react";
import { Link } from "react-router";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";

export default function NotFoundPage() {
  return (
    <>
      <PageHeader title="Page not found" />
      <EmptyState
        icon={Compass}
        title="We couldn't find that page"
        description="The address may be mistyped, or the page may have moved."
        action={
          <Button asChild>
            <Link to="/requests">Go to requests</Link>
          </Button>
        }
      />
    </>
  );
}
