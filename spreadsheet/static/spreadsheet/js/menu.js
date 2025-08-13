
$(document).ready(function(){
    $('.menu').on('mouseover', function(){
        $(this).addClass('expanded');
    })
    $('.menu').on('mouseout', function(){
        $(this).removeClass('expanded');
    })
    $('.menu').on('click', function(){
        $(this).removeClass('expanded');
    })
});
