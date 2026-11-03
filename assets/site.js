(()=>{'use strict';
// The archived static preview is not a second consultation client.
if(['127.0.0.1','localhost','[::1]'].includes(location.hostname)||location.protocol==='file:'){
  location.replace('http://127.0.0.1:3000'+(location.protocol==='file:'?'/contact/':location.pathname+location.search));return;
}
const chips=document.querySelectorAll('[data-filter]');chips.forEach(chip=>chip.addEventListener('click',()=>{chips.forEach(c=>c.classList.toggle('active',c===chip));document.querySelectorAll('.detail-card').forEach(card=>{const f=chip.dataset.filter;card.hidden=f!=='all'&&card.dataset.category!==f})}));
const files=document.getElementById('document-files'),feedback=document.getElementById('file-feedback');if(files&&feedback)files.addEventListener('change',()=>{const list=Array.from(files.files||[]);if(!list.length){feedback.textContent='尚未选择文件';return}const invalid=list.filter(f=>!['image/jpeg','image/png','application/pdf'].includes(f.type)||f.size>10*1024*1024);feedback.textContent=invalid.length?'有 '+invalid.length+' 个文件格式不符或超过10MB；请重新选择。':'已检查 '+list.length+' 个文件，格式及大小符合要求。本演示站不会上传或保存这些文件。';feedback.style.color=invalid.length?'#b34838':'#237557'});
const form=document.getElementById('consult-form');if(form)form.addEventListener('submit',e=>{e.preventDefault();form.querySelector('.form-feedback').textContent='此归档静态页面不接收咨询，请使用当前平台咨询入口。'});})();
