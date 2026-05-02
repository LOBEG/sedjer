function updateFootprintSelect() {
    _sendEvent("api:footprints", {}, function (footprints) {
        console.log(footprints);
        $('#footprint-select').empty().append($('<option value="custom">Custom</option>'))
        footprints.map(function (footprint) {
            return $('<option>').val(footprint.value).text(footprint.name);
        }).forEach(function ($o) {
            $('#footprint-select').append($o);
        });
        var currentVal = $('#footprint-input').val();
        var matchingFootprint = footprints.some(function (f) { return f.value === currentVal; });
        if(matchingFootprint) {
            $('#footprint-select').val(currentVal);
        } else {
            $('#footprint-select').val("custom");
        }
    });
}

_onInit(function () {
    
    $('#footprint-select').on('change', function () {
        var $this = $(this);
        if($this.val() == "custom") $('#footprint-input').val("").attr('disabled', false);
        else $('#footprint-input').val($this.val()).attr('disabled', true);
        storeFootprints($('#footprint-input').val());
    });
    
    updateFootprintSelect();
    
});