import List from "./List";
import Edit from "./Edit";

export default {
  options: {
    group: "admin",
    roles: ["administrator"],
  },
  list: List,
  edit: Edit,
};
