function submitGenre(genre) {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = `/filter/genre/${genre}`;
  
    const genreInput = document.createElement('input');
    genreInput.type = 'hidden';
    genreInput.name = 'genre';
    genreInput.value = genre;
  
    form.appendChild(genreInput);
    document.body.appendChild(form);
    form.submit();
  }
  
  function submitSearch(event) {
    if (event.key === 'Enter') { 
      event.preventDefault(); 
  
      const searchInput = document.getElementById('searchInput');
      const searchValue = searchInput.value.trim();
  
      if (searchValue === "") {
        alert("Search query is required.");
        return;
      }
  
      const searchInputHidden = document.createElement('input');
      searchInputHidden.type = 'hidden';
      searchInputHidden.name = 'searchQuery';
      searchInputHidden.value = searchValue;
  
      const form = document.getElementById('searchForm');
      form.appendChild(searchInputHidden);
  
      form.submit();
    }
  }
  function handleFavorite(event, form) {
    event.preventDefault();
  
    fetch(form.action, {
      method: 'POST',
      body: new FormData(form),
      headers: {
        'X-Requested-With': 'XMLHttpRequest'
      }
    }).then(response => {
      if (response.ok) {
        return response.json();
      } else {
        throw new Error('Failed to update favorite status.');
      }
    }).then(data => {
      if (data.success) {
        const checkbox = form.querySelector('input[type="checkbox"]');
        const label = form.querySelector('.heart-label');
        checkbox.checked = data.isFavorite;
  
        
        document.querySelectorAll('.heart-label').forEach(label => {
          label.classList.remove('animate-heart-burst');
        });
  
       
        if (data.isFavorite) {
          label.classList.add('animate-heart-burst');
        }
  
        console.log('Favorite status updated successfully.');
      } else {
        console.error('Failed to update favorite status.');
      }
    }).catch(error => {
      console.error('Error:', error);
    });
  }