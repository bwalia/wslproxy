import { Chip } from "@mui/material";

const stateConfig = {
  live: { color: "success", label: "Live" },
  draft: { color: "default", label: "Draft" },
  pending_approval: { color: "warning", label: "Pending Approval" },
  approved: { color: "success", label: "Approved" },
  archived: { color: "info", label: "Archived" },
  rolled_back: { color: "secondary", label: "Rolled Back" },
  rejected: { color: "error", label: "Rejected" },
  cancelled: { color: "default", label: "Cancelled" },
};

const StatusBadge = ({ status, size = "small" }) => {
  const config = stateConfig[status] || { color: "default", label: status };
  return (
    <Chip
      label={config.label}
      color={config.color}
      size={size}
      variant={status === "draft" || status === "cancelled" ? "outlined" : "filled"}
      sx={{ fontWeight: 600, fontSize: "0.75rem" }}
    />
  );
};

export default StatusBadge;
