"""Domain constants shared by models, services and schemas."""

CLIENT, OPERATOR, ADMIN = "client", "operator", "admin"
ROLES = (CLIENT, OPERATOR, ADMIN)
STAFF_ROLES = (OPERATOR, ADMIN)

GOOD, USABLE, BAD = "good", "usable", "bad"
QUALITIES = (GOOD, USABLE, BAD)
ASSIGNABLE_QUALITIES = (GOOD, USABLE)

SUBMITTED, IN_PROGRESS, DELIVERED, ACCEPTED, REJECTED = (
    "submitted",
    "in_progress",
    "delivered",
    "accepted",
    "rejected",
)
STATUSES = (SUBMITTED, IN_PROGRESS, DELIVERED, ACCEPTED, REJECTED)

# Statuses in which the set of assigned episodes may change.
ASSIGNMENT_OPEN_STATUSES = (SUBMITTED, IN_PROGRESS)

KNOWN_ROBOTS = ("arm-01", "arm-02", "arm-03", "mobile-01", "humanoid-01")

MIN_DURATION_SECONDS, MAX_DURATION_SECONDS = 1, 3600

# Simulated per-episode export job (stretch item): queued -> running -> succeeded | failed
EXPORT_PENDING, EXPORT_RUNNING, EXPORT_SUCCEEDED, EXPORT_FAILED = (
    "pending",
    "running",
    "succeeded",
    "failed",
)
EXPORT_STATUSES = (EXPORT_PENDING, EXPORT_RUNNING, EXPORT_SUCCEEDED, EXPORT_FAILED)
