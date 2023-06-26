import Show from "./Show";
import Create from "./Create";
import Edit from "./Edit";

export default {
  options: {
    group: "admin",
    roles: ["administrator"],
  },
  show: Show,
  create: Create,
  edit: Edit
};