import {expect,it,vi} from "vitest";
import {commitComboboxEnter} from "../src/lib/search-combobox-keyboard";

const option={code:"toyota:corolla",name:"Corolla"};
const event=(key="Enter")=>Object.assign(new Event("keydown",{cancelable:true}),{key});
it.each([
  {active:-1,loading:false,error:false,options:[option]},
  {active:0,loading:true,error:false,options:[option]},
  {active:0,loading:false,error:true,options:[option]},
  {active:0,loading:false,error:false,options:[]},
  {active:5,loading:false,error:false,options:[option]},
])("blocks form submission for an open popup without a selectable option: %o",state=>{
  const e=event(),choose=vi.fn(),close=vi.fn();
  expect(commitComboboxEnter(e,{open:true,...state},{choose,close})).toBe(true);
  expect(e.defaultPrevented).toBe(true);expect(choose).not.toHaveBeenCalled();expect(close).toHaveBeenCalledOnce();
});
it("commits the highlighted identity without submitting the search",()=>{
  const e=event(),choose=vi.fn(),close=vi.fn();
  commitComboboxEnter(e,{open:true,active:0,loading:false,error:false,options:[option]},{choose,close});
  expect(e.defaultPrevented).toBe(true);expect(choose).toHaveBeenCalledExactlyOnceWith(option);expect(close).not.toHaveBeenCalled();
});
it("leaves unrelated keys and a closed popup to their normal handlers",()=>{
  for(const [key,open] of [["ArrowDown",true],["Escape",true],["Enter",false]] as const){
    const e=event(key),choose=vi.fn(),close=vi.fn();
    expect(commitComboboxEnter(e,{open,active:0,loading:false,error:false,options:[option]},{choose,close})).toBe(false);
    expect(e.defaultPrevented).toBe(false);expect(choose).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();
  }
});
