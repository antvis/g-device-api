import * as demos from "./demos";

const select = document.createElement("select");
select.style.margin = "1em";
select.onchange = onChange;
select.style.display = "block";
document.body.append(select);

const options = Object.keys(demos).map((d) => {
  const option = document.createElement("option");
  option.textContent = d;
  option.value = d;
  return option;
});
options.forEach((d) => select.append(d));

const initialValue = new URL(location as any).searchParams.get(
  "name"
) as string;
if (demos[initialValue]) select.value = initialValue;

let node;
render();

function render() {
  if (node) node.remove();
  const demo = demos[select.value];
  node = demo();
  document.body.append(node);
}

function onChange() {
  const { value } = select;
  history.pushState({ value }, "", `?name=${value}`);
  render();
}
