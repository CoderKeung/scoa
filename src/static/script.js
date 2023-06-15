$("#update").click(()=>{
    $("#update").find("span").text("正在更新")
    $.get(
        "/update",
        (data)=>{
            console.log(data)
            switch (data.status) {
                case 0:
                    swal("登录超时", "请重新更新", "error").then(()=>{
                        location.reload();
                    });
                    break;
                case 1:
                    swal("成功", "更新完成", "success").then(()=>{
                        location.reload();
                    });
                    break;
                case 2:
                    swal("失败", "未知错误", "error").then(()=>{
                        location.reload();
                    });
                    break;
            }
        }
    )
})

function getFile(element) {
    window.open("/download?id="+element.name, "_self")
}