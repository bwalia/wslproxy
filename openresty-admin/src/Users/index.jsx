import List from "./List";
import Create from "./Create";
import Edit from "./Edit";

export default {
  options: {
    group: "admin",
    roles: ["administrator"],
  },
  list: List,
  create: Create,
  edit: Edit
};